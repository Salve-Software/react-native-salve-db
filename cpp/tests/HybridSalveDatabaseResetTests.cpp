#include <catch2/catch_test_macros.hpp>
#include "../database/DatabaseManager.hpp"
#include "../database/NativeConfigStore.hpp"
#include "../platform/platform.hpp"
#include "support/HybridDatabaseHarness.hpp"
#include "support/platform_test.hpp"
#include <atomic>
#include <chrono>
#include <thread>

using margelo::nitro::salvedb::DatabaseManager;
using margelo::nitro::salvedb::NativeConfigStore;
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

std::string customersSchemaJson() {
  return R"({
    name: "customers", version: 1, primaryKey: "id",
    columns: { id: { type: "text" }, name: { type: "text" }, updatedAt: { type: "datetime", nullable: false } },
    sync: {
      enabled: true,
      endpoint: { basePath: "/customers", listQueryTemplate: "updatedAfter={since}&limit={limit}" },
      pagination: { pageSize: 20, maxPagesPerSession: 20 }
    }
  })";
}

int sqlCount(const std::string& sql) {
  auto rows = DatabaseManager::shared().connection()->execute(sql, {});
  return static_cast<int>(std::get<double>(rows.rows[0][0]));
}

} // namespace

TEST_CASE("db.reset() wipes table rows, and register() alone (no configure()) rebuilds an empty table", "[database][reset]") {
  HybridDatabaseHarness harness;
  createDb(harness);
  harness.run("db.configure({ name: '" + uniqueDbName("reset_data") + "' })");

  std::string schema = R"({
    name: "reset_probe", version: 1, primaryKey: "id",
    columns: { id: { type: "integer" } }
  })";
  harness.run("db.registerSchema(JSON.stringify(" + schema + "))");
  harness.run(R"JS(db.execute("INSERT INTO reset_probe (id) VALUES (?)", [1]))JS");
  harness.run(R"JS(db.execute("INSERT INTO reset_probe (id) VALUES (?)", [2]))JS");
  REQUIRE(sqlCount("SELECT COUNT(*) FROM reset_probe") == 2);

  harness.run("db.reset()");

  // No configure() call — the connection stays open across reset().
  harness.run("db.registerSchema(JSON.stringify(" + schema + "))");
  REQUIRE(sqlCount("SELECT COUNT(*) FROM reset_probe") == 0);
}

TEST_CASE("db.reset() empties a populated sync_queue without repropagating the deletes", "[database][reset]") {
  HybridDatabaseHarness harness;
  createDb(harness);
  harness.run("db.configure({ name: '" + uniqueDbName("reset_queue") + "' })");
  harness.run("db.registerSchema(JSON.stringify(" + customersSchemaJson() + "))");
  harness.run(R"JS(db.execute("INSERT INTO customers (id, name, updatedAt) VALUES (?, ?, ?)", ['1', 'a', 100]))JS");
  REQUIRE(sqlCount("SELECT COUNT(*) FROM sync_queue WHERE entity = 'customers'") == 1);

  harness.run("db.reset()");

  REQUIRE(sqlCount("SELECT COUNT(*) FROM sync_queue") == 0);
}

TEST_CASE("db.reset() clears credentials so a later seedInitialTokens isn't silently ignored", "[database][reset][credentials]") {
  resetSecureStore();
  HybridDatabaseHarness harness;
  createDb(harness);

  harness.run(R"(db.configure({
    name: ')" + uniqueDbName("reset_creds_a") + R"(',
    credentials: {
      provider: 'oauth2', accessTokenHeaderName: 'Authorization', accessTokenScheme: 'Bearer',
      tokens: { accessToken: 'token-a', refreshToken: 'refresh-a' },
      refresh: { endpoint: '/auth/refresh', responseAccessTokenPath: '$.accessToken', responseRefreshTokenPath: '$.refreshToken' }
    }
  }))");
  REQUIRE(DatabaseManager::shared().credentials().getAccessToken().value() == "token-a");

  harness.run("db.reset()");

  harness.run(R"(db.configure({
    name: ')" + uniqueDbName("reset_creds_b") + R"(',
    credentials: {
      provider: 'oauth2', accessTokenHeaderName: 'Authorization', accessTokenScheme: 'Bearer',
      tokens: { accessToken: 'token-b', refreshToken: 'refresh-b' },
      refresh: { endpoint: '/auth/refresh', responseAccessTokenPath: '$.accessToken', responseRefreshTokenPath: '$.refreshToken' }
    }
  }))");

  REQUIRE(DatabaseManager::shared().credentials().getAccessToken().value() == "token-b");
}

TEST_CASE("db.reset() resolves without throwing when nothing was ever configured", "[database][reset]") {
  DatabaseManager::shared().closeForTesting();
  resetSecureStore();

  HybridDatabaseHarness harness;
  createDb(harness);

  REQUIRE_NOTHROW(harness.run("db.reset()"));
  REQUIRE_FALSE(DatabaseManager::shared().isOpen());
}

TEST_CASE("db.reset() removes the persisted config file and re-arms platform::scheduleBackgroundSync()", "[database][reset][background]") {
  HybridDatabaseHarness harness;
  createDb(harness);
  harness.run(R"(db.configure({
    name: ')" + uniqueDbName("reset_background") + R"(',
    background: { minimumInterval: 900000 }
  }))");
  REQUIRE(NativeConfigStore::load().has_value());

  int before = margelo::nitro::salvedb::platform::test::scheduleBackgroundSyncCallCount();

  harness.run("db.reset()");

  REQUIRE(margelo::nitro::salvedb::platform::test::scheduleBackgroundSyncCallCount() == before + 1);
  REQUIRE_FALSE(NativeConfigStore::load().has_value());
}

TEST_CASE("db.reset() is serialized against a held sync lock, not run concurrently with it", "[database][reset][concurrency]") {
  HybridDatabaseHarness harness;
  createDb(harness);
  harness.run("db.configure({ name: '" + uniqueDbName("reset_lock") + "' })");

  auto held = DatabaseManager::shared().lockSync();

  std::atomic<bool> resetDone{false};
  std::thread t([&]() {
    harness.run("db.reset()");
    resetDone = true;
  });

  std::this_thread::sleep_for(std::chrono::milliseconds(100));
  REQUIRE_FALSE(resetDone.load()); // still waiting on the lock

  held.unlock();
  t.join();
  REQUIRE(resetDone.load());
}

TEST_CASE("DatabaseManager state after db.reset(): connection stays open, config is cleared", "[database][reset]") {
  HybridDatabaseHarness harness;
  createDb(harness);
  harness.run(R"(db.configure({
    name: ')" + uniqueDbName("reset_state") + R"(',
    baseUrl: 'https://api.company.com',
    network: { timeout: 5000 },
    background: { minimumInterval: 900000 }
  }))");
  REQUIRE(DatabaseManager::shared().appConfigured());

  harness.run("db.reset()");

  REQUIRE(DatabaseManager::shared().isOpen());
  REQUIRE_FALSE(DatabaseManager::shared().appConfigured());
  REQUIRE_FALSE(DatabaseManager::shared().background().has_value());
  REQUIRE_THROWS(DatabaseManager::shared().network());
  REQUIRE_THROWS(DatabaseManager::shared().credentials());
}

TEST_CASE("db.reset() then register() recreates triggers and metadata cleanly", "[database][reset]") {
  HybridDatabaseHarness harness;
  createDb(harness);
  harness.run("db.configure({ name: '" + uniqueDbName("reset_reregister") + "' })");
  harness.run("db.registerSchema(JSON.stringify(" + customersSchemaJson() + "))");
  harness.run(R"JS(db.execute("INSERT INTO customers (id, name, updatedAt) VALUES (?, ?, ?)", ['1', 'a', 100]))JS");

  harness.run("db.reset()");
  harness.run("db.registerSchema(JSON.stringify(" + customersSchemaJson() + "))");

  harness.run(R"JS(db.execute("INSERT INTO customers (id, name, updatedAt) VALUES (?, ?, ?)", ['2', 'b', 200]))JS");
  REQUIRE(sqlCount("SELECT COUNT(*) FROM customers") == 1); // '1' was wiped, '2' round-trips
  REQUIRE(sqlCount("SELECT COUNT(*) FROM sync_queue WHERE entity = 'customers'") == 1);
}

TEST_CASE("a subscribeToChanges subscription survives reset() followed by configure() with the same name", "[database][reset][notify]") {
  resetSecureStore();
  HybridDatabaseHarness harness;
  createDb(harness);
  std::string name = uniqueDbName("reset_subscription_survives");

  harness.run(R"(db.configure({
    name: ')" + name + R"(',
    credentials: {
      provider: 'oauth2', accessTokenHeaderName: 'Authorization', accessTokenScheme: 'Bearer',
      tokens: { accessToken: 'token-a', refreshToken: 'refresh-a' },
      refresh: { endpoint: '/auth/refresh', responseAccessTokenPath: '$.accessToken', responseRefreshTokenPath: '$.refreshToken' }
    }
  }))");

  harness.run(R"(
    (() => {
      globalThis.__seen = [];
      globalThis.__subId = db.subscribeToChanges((tables) => { globalThis.__seen.push(tables); });
      return true;
    })()
  )");

  harness.run("db.reset()");

  // Same name — this is the case that used to silently kill the subscription above.
  harness.run(R"(db.configure({
    name: ')" + name + R"(',
    credentials: {
      provider: 'oauth2', accessTokenHeaderName: 'Authorization', accessTokenScheme: 'Bearer',
      tokens: { accessToken: 'token-b', refreshToken: 'refresh-b' },
      refresh: { endpoint: '/auth/refresh', responseAccessTokenPath: '$.accessToken', responseRefreshTokenPath: '$.refreshToken' }
    }
  }))");
  harness.run("db.registerSchema(JSON.stringify(" + customersSchemaJson() + "))");
  harness.run(R"JS(db.execute("INSERT INTO customers (id, name, updatedAt) VALUES (?, ?, ?)", ['1', 'a', 100]))JS");

  // Two coalesced events: registerSchema() touching its own internal tables, then the INSERT
  // (customers + sync_queue + _salve_sync_metadata, coalesced since they happen in one statement).
  auto seen = harness.run("globalThis.__seen");
  REQUIRE(seen == R"([["_salve_schema_versions","_salve_sync_definitions"],["_salve_sync_metadata","customers","sync_queue"]])");
}
