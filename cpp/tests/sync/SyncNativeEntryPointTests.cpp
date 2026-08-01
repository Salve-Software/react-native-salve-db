#include <catch2/catch_test_macros.hpp>
#include "../../database/DatabaseManager.hpp"
#include "../../database/MigrationEngine.hpp"
#include "../../database/NativeConfigStore.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/SyncNativeEntryPoint.hpp"
#include "../support/platform_test.hpp"

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

// Sync-enabled fixture, so a session that actually runs issues an HTTP call —
// that call is how these tests tell "synced" from "skipped".
void openSyncFixture(const std::string& testName) {
  platform::deleteSecureValue("salvedb.credentials.accessToken");
  platform::deleteSecureValue("salvedb.credentials.refreshToken");

  DatabaseManager::shared().open(uniqueDbName(testName));
  MigrationEngine engine(DatabaseManager::shared().connection());
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": {
      "enabled": true,
      "endpoint": { "basePath": "/customers", "sinceParam": "updatedAfter", "limitParam": "limit" },
      "pagination": { "pageSize": 20, "maxPagesPerSession": 20 }
    }
  })"));

  DatabaseManager::shared().configureCredentials(
    "oauth2", "Authorization", "Bearer", "/auth/refresh", "$.accessToken", "$.refreshToken",
    InitialCredentialTokens{"access-1", "refresh-1"}
  );
  DatabaseManager::shared().configureNetwork("https://api.company.com", 5000.0);
}

} // namespace

TEST_CASE("triggerSyncAllFromNative swallows contention instead of throwing", "[sync][SyncNativeEntryPoint]") {
  DatabaseManager::shared().open(uniqueDbName("native_entry_point_contention"));
  DatabaseManager::shared().markAppConfigured();

  auto held = DatabaseManager::shared().lockSync();

  REQUIRE_NOTHROW(triggerSyncAllFromNative());
}

// An open database is not consent to sync: the platform layer can leave one
// open before Database.configure() runs, and syncing then blocks configure on
// the JS thread waiting for the sync mutex.
TEST_CASE("triggerSyncAllFromNative stays inert until the app has configured", "[sync][SyncNativeEntryPoint]") {
  DatabaseManager::shared().closeForTesting();
  openSyncFixture("native_entry_point_unconfigured");

  int httpCalls = 0;
  platform::test::setHttpExecuteResult([&](const HttpRequest&) -> HttpOutcome {
    ++httpCalls;
    return HttpResponse{200, {}, "[]"};
  });

  REQUIRE(DatabaseManager::shared().isOpen());
  REQUIRE_FALSE(DatabaseManager::shared().appConfigured());

  triggerSyncAllFromNative();

  REQUIRE(httpCalls == 0);
}

TEST_CASE("triggerSyncAllFromNative syncs once the app has configured", "[sync][SyncNativeEntryPoint]") {
  DatabaseManager::shared().closeForTesting();
  openSyncFixture("native_entry_point_configured");
  DatabaseManager::shared().markAppConfigured();

  int httpCalls = 0;
  platform::test::setHttpExecuteResult([&](const HttpRequest&) -> HttpOutcome {
    ++httpCalls;
    return HttpResponse{200, {}, "[]"};
  });

  triggerSyncAllFromNative();

  REQUIRE(httpCalls > 0);
}

TEST_CASE("wakeBackgroundSyncFromNative does not throw when already open and locked", "[sync][SyncNativeEntryPoint]") {
  DatabaseManager::shared().open(uniqueDbName("wake_background_contention"));

  auto held = DatabaseManager::shared().lockSync();

  REQUIRE_NOTHROW(wakeBackgroundSyncFromNative());
}

TEST_CASE("nativeBackgroundConstraints reflects DatabaseManager's configured background", "[sync][SyncNativeEntryPoint]") {
  DatabaseManager::shared().open(uniqueDbName("native_background_constraints"));
  DatabaseManager::shared().configureBackground(BackgroundConfig{450000.0, true, false});

  auto constraints = nativeBackgroundConstraints();

  REQUIRE(constraints.hasConfig);
  REQUIRE(constraints.minimumIntervalMs == 450000.0);
  REQUIRE(constraints.requiresNetwork == true);
  REQUIRE(constraints.requiresCharging == false);
}

TEST_CASE("nativeBackgroundConstraints reports hasConfig=false when none was set", "[sync][SyncNativeEntryPoint]") {
  DatabaseManager::shared().open(uniqueDbName("native_background_constraints_none"));
  DatabaseManager::shared().configureBackground(std::nullopt);

  auto constraints = nativeBackgroundConstraints();

  REQUIRE_FALSE(constraints.hasConfig);
}

TEST_CASE("wakeBackgroundSyncFromNative rehydrates and runs from a closed state", "[sync][SyncNativeEntryPoint]") {
  DatabaseManager::shared().closeForTesting();

  PersistedConfig config;
  config.dbName = uniqueDbName("wake_cold_start");
  config.walMode = true;
  config.syncOnAppOpen = true;
  NativeConfigStore::save(config);

  REQUIRE_NOTHROW(wakeBackgroundSyncFromNative());
  REQUIRE(DatabaseManager::shared().isOpen());
}

// Called at process load, before Database.configure(). Opening the database
// here is what used to make the foreground sync trigger fire ahead of startup.
TEST_CASE("nativeBackgroundConstraints reads persisted config without opening the database", "[sync][SyncNativeEntryPoint]") {
  DatabaseManager::shared().closeForTesting();

  PersistedConfig config;
  config.dbName = uniqueDbName("constraints_cold_start");
  config.walMode = true;
  config.syncOnAppOpen = true;
  config.background = BackgroundConfig{300000.0, false, true};
  NativeConfigStore::save(config);

  auto constraints = nativeBackgroundConstraints();

  REQUIRE(constraints.hasConfig);
  REQUIRE(constraints.minimumIntervalMs == 300000.0);
  REQUIRE(constraints.requiresNetwork == false);
  REQUIRE(constraints.requiresCharging == true);
  REQUIRE_FALSE(DatabaseManager::shared().isOpen());
  REQUIRE_FALSE(DatabaseManager::shared().appConfigured());
}
