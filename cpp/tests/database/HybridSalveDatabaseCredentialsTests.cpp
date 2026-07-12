#include <catch2/catch_test_macros.hpp>
#include "../../database/DatabaseManager.hpp"
#include "../../platform/platform.hpp"
#include "../support/HybridDatabaseHarness.hpp"

using margelo::nitro::salvedb::DatabaseManager;
using margelo::nitro::salvedb::tests::HybridDatabaseHarness;

namespace {

std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

// CredentialProvider persists under fixed, global keys (MVP: one credential
// per app). Reset before seeding so this test doesn't inherit leftover state
// from CredentialProviderTests.cpp — they share the same in-memory test store.
void resetSecureStore() {
  margelo::nitro::salvedb::platform::deleteSecureValue("salvedb.credentials.accessToken");
  margelo::nitro::salvedb::platform::deleteSecureValue("salvedb.credentials.refreshToken");
}

} // namespace

// Drives configure() through the real JS/JSI bridge (like every other test
// in this suite) but asserts on native-side state instead of a JS return
// value — by design, tokens never cross back over JSI (TASK-009 acceptance
// criterion), so there's nothing for JS to read here.
TEST_CASE("configure() with credentials.tokens seeds the CredentialProvider", "[database][credentials]") {
  resetSecureStore();
  HybridDatabaseHarness harness;
  auto db = "globalThis.NitroModulesProxy.createHybridObject('SalveDatabase')";
  harness.run("(() => { globalThis.db = " + std::string(db) + "; return true; })()");

  harness.run(R"(db.configure({
    name: ')" + uniqueDbName("credentials") + R"(',
    credentials: {
      provider: 'oauth2',
      accessTokenHeaderName: 'Authorization',
      tokens: { accessToken: 'seeded-access', refreshToken: 'seeded-refresh' },
      refresh: {
        endpoint: '/auth/refresh',
        responseAccessTokenPath: '$.accessToken',
        responseRefreshTokenPath: '$.refreshToken'
      }
    }
  }))");

  auto& credentials = DatabaseManager::shared().credentials();
  REQUIRE(credentials.getAccessToken().value() == "seeded-access");

  auto [headerName, headerValue] = credentials.getAuthHeader();
  REQUIRE(headerName == "Authorization");
  REQUIRE(headerValue == "seeded-access");
}
