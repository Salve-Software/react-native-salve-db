#include <catch2/catch_test_macros.hpp>
#include "../database/DatabaseManager.hpp"
#include "../platform/platform.hpp"
#include "support/HybridDatabaseHarness.hpp"
#include "support/platform_test.hpp"
#include <atomic>
#include <chrono>
#include <thread>

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
    columns: { id: { type: "text" }, name: { type: "text" }, updatedAt: { type: "datetime", nullable: false } },
    sync: {
      enabled: true,
      endpoint: { basePath: "/customers", sinceParam: "updatedAfter", limitParam: "limit" },
      pagination: { pageSize: 20, maxPagesPerSession: 20 }
    }
  })";
}

} // namespace

TEST_CASE("db.triggerSync() runs a full sync cycle through the real JSI bridge", "[database][sync]") {
  deleteSecureValue("salvedb.credentials.accessToken");
  deleteSecureValue("salvedb.credentials.refreshToken");

  setHttpExecuteResult([](const HttpRequest& request) -> HttpOutcome {
    if (request.method == margelo::nitro::salvedb::HttpMethod::Get) return HttpResponse{200, {}, "[]"};
    return HttpResponse{201, {}, *request.body}; // POST: echo the pushed entity back
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

  auto resultJson = harness.run("db.triggerSync('customers', false)");
  REQUIRE(resultJson.find(R"("operationsApplied":1)") != std::string::npos);

  auto rows = DatabaseManager::shared().connection()->execute("SELECT COUNT(*) FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 0.0);
}

TEST_CASE("db.configure() is serialized against an in-flight sync session", "[database][sync][concurrency]") {
  deleteSecureValue("salvedb.credentials.accessToken");
  deleteSecureValue("salvedb.credentials.refreshToken");

  HybridDatabaseHarness harness;
  createDb(harness);
  harness.run("db.configure({ name: '" + uniqueDbName("e2e_configure_lock") + "' })");

  auto held = DatabaseManager::shared().lockSync();

  std::atomic<bool> reconfigured{false};
  std::thread t([&]() {
    harness.run("db.configure({ name: '" + uniqueDbName("e2e_configure_lock_second") + "' })");
    reconfigured = true;
  });

  std::this_thread::sleep_for(std::chrono::milliseconds(100));
  REQUIRE_FALSE(reconfigured.load());

  held.unlock();
  t.join();
  REQUIRE(reconfigured.load());
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
    return HttpResponse{200, {}, "[]"};
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
  harness.run("db.triggerSync('customers', false)");

  REQUIRE(DatabaseManager::shared().credentials().getAccessToken().value() == "access-2");
}

TEST_CASE("db.triggerSync(name, true) resolves undefined when a sync session is in progress", "[database][sync][concurrency]") {
  deleteSecureValue("salvedb.credentials.accessToken");
  deleteSecureValue("salvedb.credentials.refreshToken");

  HybridDatabaseHarness harness;
  createDb(harness);
  harness.run("db.configure({ name: '" + uniqueDbName("e2e_trigger_sync_discard") + "' })");
  harness.run("db.registerSchema(JSON.stringify(" + customersSchemaJson() + "))");

  // Promise<T>::async runs the actual tryLockSync() on Nitro's ThreadPool,
  // not the runtime-owning thread that's holding the lock here — safe,
  // unlike a same-thread try_lock (see the SyncOrchestrator-level test).
  auto held = DatabaseManager::shared().lockSync();

  auto resultJson = harness.run("db.triggerSync('customers', true)");

  held.unlock();

  REQUIRE(resultJson == "null"); // JSON.stringify(undefined ?? null)
}

TEST_CASE("db.triggerSyncAll() runs every enabled schema through the real JSI bridge", "[database][sync]") {
  deleteSecureValue("salvedb.credentials.accessToken");
  deleteSecureValue("salvedb.credentials.refreshToken");

  setHttpExecuteResult([](const HttpRequest& request) -> HttpOutcome {
    if (request.method == margelo::nitro::salvedb::HttpMethod::Get) return HttpResponse{200, {}, "[]"};
    return HttpResponse{201, {}, *request.body};
  });

  HybridDatabaseHarness harness;
  createDb(harness);

  harness.run(R"(db.configure({
    name: ')" + uniqueDbName("e2e_sync_all") + R"(',
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

  auto resultJson = harness.run("db.triggerSyncAll(false)");

  // Assert on the actual array shape — one result, for "customers" — not
  // just that the promise resolved.
  REQUIRE(resultJson.front() == '[');
  REQUIRE(resultJson.find(R"("operationsApplied":1)") != std::string::npos);
  REQUIRE(resultJson.find("},{") == std::string::npos); // exactly one element

  auto rows = DatabaseManager::shared().connection()->execute("SELECT COUNT(*) FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 0.0);
}
