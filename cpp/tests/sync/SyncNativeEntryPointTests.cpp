#include <catch2/catch_test_macros.hpp>
#include "../../database/DatabaseManager.hpp"
#include "../../database/NativeConfigStore.hpp"
#include "../../sync/SyncNativeEntryPoint.hpp"

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

} // namespace

TEST_CASE("triggerSyncAllFromNative swallows contention instead of throwing", "[sync][SyncNativeEntryPoint]") {
  DatabaseManager::shared().open(uniqueDbName("native_entry_point_contention"));

  auto held = DatabaseManager::shared().lockSync();

  REQUIRE_NOTHROW(triggerSyncAllFromNative());
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

TEST_CASE("nativeBackgroundConstraints rehydrates background config from a closed state", "[sync][SyncNativeEntryPoint]") {
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
}
