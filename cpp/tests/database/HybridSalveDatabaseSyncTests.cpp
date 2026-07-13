#include <catch2/catch_test_macros.hpp>
#include "../../database/DatabaseManager.hpp"
#include "../../platform/platform.hpp"
#include "../support/HybridDatabaseHarness.hpp"
#include "../support/platform_test.hpp"

using margelo::nitro::salvedb::DatabaseManager;
using margelo::nitro::salvedb::platform::deleteSecureValue;
using margelo::nitro::salvedb::tests::HybridDatabaseHarness;
using margelo::nitro::salvedb::platform::test::setHttpExecuteResult;
using margelo::nitro::salvedb::HttpRequest;
using margelo::nitro::salvedb::HttpOutcome;
using margelo::nitro::salvedb::HttpResponse;

namespace {

std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

void createDb(HybridDatabaseHarness& harness) {
  harness.run("(() => { globalThis.db = globalThis.NitroModulesProxy.createHybridObject('SalveDatabase'); return true; })()");
}

std::string customersSchemaJson() {
  return R"({
    name: "customers", version: 1, primaryKey: "id",
    columns: { id: { type: "text" }, name: { type: "text" }, updatedAt: { type: "datetime" } },
    sync: {
      enabled: true,
      endpoint: { method: "POST", path: "/sync/customers" },
      pagination: { pageSize: 20, maxPagesPerSession: 20 },
      request: { body: { cursor: { $ref: "cursor" }, operations: { $ref: "operations" }, pageSize: { $ref: "pageSize" } } },
      response: { cursor: "$.cursor", operations: "$.operations", hasMore: "$.hasMore" }
    }
  })";
}

} // namespace

TEST_CASE("db.triggerSync() runs a full sync cycle through the real JSI bridge", "[database][sync]") {
  deleteSecureValue("salvedb.credentials.accessToken");
  deleteSecureValue("salvedb.credentials.refreshToken");

  setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{200, {}, R"({"cursor": "c1", "hasMore": false, "operations": []})"};
  });

  HybridDatabaseHarness harness;
  createDb(harness);

  harness.run(R"(db.configure({
    name: ')" + uniqueDbName("e2e_sync") + R"(',
    baseUrl: 'https://api.company.com',
    network: { timeout: 5000 },
    credentials: {
      provider: 'oauth2', accessTokenHeaderName: 'Authorization',
      tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
      refresh: { endpoint: '/auth/refresh', responseAccessTokenPath: '$.accessToken', responseRefreshTokenPath: '$.refreshToken' }
    }
  }))");

  harness.run("db.registerSchema(JSON.stringify(" + customersSchemaJson() + "))");
  harness.run(R"JS(db.execute("INSERT INTO customers (id, name, updatedAt) VALUES (?, ?, ?)", ['1', 'a', 100]))JS");

  auto resultJson = harness.run("db.triggerSync('customers')");
  REQUIRE(resultJson.find(R"("cursor":"c1")") != std::string::npos);

  auto rows = DatabaseManager::shared().connection()->execute("SELECT COUNT(*) FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 0.0);
}

TEST_CASE("db.triggerSync() refreshes the token on 401 through the real JSI bridge", "[database][sync]") {
  deleteSecureValue("salvedb.credentials.accessToken");
  deleteSecureValue("salvedb.credentials.refreshToken");

  setHttpExecuteResult([](const HttpRequest& request) -> HttpOutcome {
    if (request.url.find("/auth/refresh") != std::string::npos) {
      return HttpResponse{200, {}, R"({"accessToken": "access-2", "refreshToken": "refresh-2"})"};
    }
    std::string authHeader;
    for (auto& [name, value] : request.headers) {
      if (name == "Authorization") authHeader = value;
    }
    if (authHeader == "access-1") return HttpResponse{401, {}, "{}"};
    return HttpResponse{200, {}, R"({"cursor": "c1", "hasMore": false, "operations": []})"};
  });

  HybridDatabaseHarness harness;
  createDb(harness);

  harness.run(R"(db.configure({
    name: ')" + uniqueDbName("e2e_sync_401") + R"(',
    baseUrl: 'https://api.company.com',
    network: { timeout: 5000 },
    credentials: {
      provider: 'oauth2', accessTokenHeaderName: 'Authorization',
      tokens: { accessToken: 'access-1', refreshToken: 'refresh-1' },
      refresh: { endpoint: '/auth/refresh', responseAccessTokenPath: '$.accessToken', responseRefreshTokenPath: '$.refreshToken' }
    }
  }))");

  harness.run("db.registerSchema(JSON.stringify(" + customersSchemaJson() + "))");
  harness.run("db.triggerSync('customers')");

  REQUIRE(DatabaseManager::shared().credentials().getAccessToken().value() == "access-2");
}
