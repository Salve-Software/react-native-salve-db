#include <catch2/catch_test_macros.hpp>
#include "../database/DatabaseManager.hpp"
#include "../platform/platform.hpp"
#include "support/HybridDatabaseHarness.hpp"
#include <atomic>
#include <chrono>
#include <thread>

using margelo::nitro::salvedb::DatabaseManager;
using margelo::nitro::salvedb::platform::deleteSecureValue;
using margelo::nitro::salvedb::tests::HybridDatabaseHarness;

namespace {

std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

void resetSecureStore() {
  deleteSecureValue("salvedb.credentials.accessToken");
  deleteSecureValue("salvedb.credentials.refreshToken");
}

void createDb(HybridDatabaseHarness& harness) {
  harness.run("(() => { globalThis.db = globalThis.NitroModulesProxy.createHybridObject('SalveDatabase'); return true; })()");
}

int sqlCount(const std::string& sql) {
  auto rows = DatabaseManager::shared().connection()->execute(sql, {});
  return static_cast<int>(std::get<double>(rows.rows[0][0]));
}

std::string configureWithCreds(const std::string& dbName, const std::string& accessToken, const std::string& refreshToken) {
  return R"(db.configure({
    name: ')" + dbName + R"(',
    credentials: {
      provider: 'oauth2', accessTokenHeaderName: 'Authorization', accessTokenScheme: 'Bearer',
      tokens: { accessToken: ')" + accessToken + R"(', refreshToken: ')" + refreshToken + R"(' },
      refresh: { endpoint: '/auth/refresh', responseAccessTokenPath: '$.accessToken', responseRefreshTokenPath: '$.refreshToken' }
    }
  }))";
}

} // namespace

TEST_CASE("db.logout() clears credentials so a later seedInitialTokens isn't silently ignored", "[database][logout][credentials]") {
  resetSecureStore();
  HybridDatabaseHarness harness;
  createDb(harness);

  harness.run(configureWithCreds(uniqueDbName("logout_creds_a"), "token-a", "refresh-a"));
  REQUIRE(DatabaseManager::shared().credentials().getAccessToken().value() == "token-a");

  harness.run("db.logout()");

  // Deliberately a different db name/connection — the already-seeded guard
  // lives in the Keychain under a fixed key (CredentialProvider.cpp),
  // independent of which SQLite connection is open, so this still proves
  // logout() cleared it rather than the guard merely resetting per-connection.
  harness.run(configureWithCreds(uniqueDbName("logout_creds_b"), "token-b", "refresh-b"));

  REQUIRE(DatabaseManager::shared().credentials().getAccessToken().value() == "token-b");
}

TEST_CASE("db.logout() leaves local data rows untouched, unlike reset()", "[database][logout]") {
  HybridDatabaseHarness harness;
  createDb(harness);
  harness.run("db.configure({ name: '" + uniqueDbName("logout_data") + "' })");

  std::string schema = R"({
    name: "logout_probe", version: 1, primaryKey: "id",
    columns: { id: { type: "integer" } }
  })";
  harness.run("db.registerSchema(JSON.stringify(" + schema + "))");
  harness.run(R"JS(db.execute("INSERT INTO logout_probe (id) VALUES (?)", [1]))JS");
  harness.run(R"JS(db.execute("INSERT INTO logout_probe (id) VALUES (?)", [2]))JS");
  REQUIRE(sqlCount("SELECT COUNT(*) FROM logout_probe") == 2);

  harness.run("db.logout()");

  REQUIRE(sqlCount("SELECT COUNT(*) FROM logout_probe") == 2);
}

TEST_CASE("db.logout() leaves configure()'d state (network, background) intact, unlike reset()", "[database][logout]") {
  HybridDatabaseHarness harness;
  createDb(harness);
  harness.run(R"(db.configure({
    name: ')" + uniqueDbName("logout_state") + R"(',
    baseUrl: 'https://api.company.com',
    network: { timeout: 5000 },
    background: { minimumInterval: 900000 }
  }))");
  REQUIRE(DatabaseManager::shared().appConfigured());

  harness.run("db.logout()");

  REQUIRE(DatabaseManager::shared().isOpen());
  REQUIRE(DatabaseManager::shared().appConfigured());
  REQUIRE(DatabaseManager::shared().background().has_value());
  REQUIRE_NOTHROW(DatabaseManager::shared().network());
  // Credentials were never configured in this test, so accessing them still throws either way.
}

TEST_CASE("db.logout() does not throw when no credentials were ever configured", "[database][logout]") {
  resetSecureStore();
  HybridDatabaseHarness harness;
  createDb(harness);
  harness.run("db.configure({ name: '" + uniqueDbName("logout_no_creds") + "' })");

  REQUIRE_NOTHROW(harness.run("db.logout()"));
}

TEST_CASE("db.logout() does not throw when the database was never opened", "[database][logout]") {
  DatabaseManager::shared().closeForTesting();
  resetSecureStore();

  HybridDatabaseHarness harness;
  createDb(harness);

  REQUIRE_NOTHROW(harness.run("db.logout()"));
}

TEST_CASE("db.logout() is serialized against a held sync lock, not run concurrently with it", "[database][logout][concurrency]") {
  HybridDatabaseHarness harness;
  createDb(harness);
  harness.run("db.configure({ name: '" + uniqueDbName("logout_lock") + "' })");

  auto held = DatabaseManager::shared().lockSync();

  std::atomic<bool> logoutDone{false};
  std::thread t([&]() {
    harness.run("db.logout()");
    logoutDone = true;
  });

  std::this_thread::sleep_for(std::chrono::milliseconds(100));
  REQUIRE_FALSE(logoutDone.load()); // still waiting on the lock

  held.unlock();
  t.join();
  REQUIRE(logoutDone.load());
}
