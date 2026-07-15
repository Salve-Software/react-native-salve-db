#include <catch2/catch_test_macros.hpp>
#include "../../database/DatabaseManager.hpp"
#include "../../database/NativeConfigStore.hpp"
#include "../support/HybridDatabaseHarness.hpp"

using margelo::nitro::salvedb::DatabaseManager;
using margelo::nitro::salvedb::NativeConfigStore;
using margelo::nitro::salvedb::tests::HybridDatabaseHarness;

namespace {

std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

void createDb(HybridDatabaseHarness& harness) {
  harness.run("(() => { globalThis.db = globalThis.NitroModulesProxy.createHybridObject('SalveDatabase'); return true; })()");
}

} // namespace

TEST_CASE("configure() with background populates DatabaseManager and NativeConfigStore", "[database][background]") {
  HybridDatabaseHarness harness;
  createDb(harness);

  harness.run(R"(db.configure({
    name: ')" + uniqueDbName("background") + R"(',
    background: { minimumInterval: 900000, requiresNetwork: true, requiresCharging: true }
  }))");

  auto background = DatabaseManager::shared().background();
  REQUIRE(background.has_value());
  REQUIRE(background->minimumIntervalMs == 900000.0);
  REQUIRE(background->requiresNetwork == true);
  REQUIRE(background->requiresCharging == true);

  auto persisted = NativeConfigStore::load();
  REQUIRE(persisted.has_value());
  REQUIRE(persisted->background.has_value());
  REQUIRE(persisted->background->minimumIntervalMs == 900000.0);
}

TEST_CASE("configure() without background clears any previous DatabaseManager background config", "[database][background]") {
  HybridDatabaseHarness harnessWithBackground;
  createDb(harnessWithBackground);
  harnessWithBackground.run(R"(db.configure({
    name: ')" + uniqueDbName("background_then_none_a") + R"(',
    background: { minimumInterval: 900000 }
  }))");
  REQUIRE(DatabaseManager::shared().background().has_value());

  HybridDatabaseHarness harnessWithoutBackground;
  createDb(harnessWithoutBackground);
  harnessWithoutBackground.run(R"(db.configure({
    name: ')" + uniqueDbName("background_then_none_b") + R"('
  }))");

  REQUIRE_FALSE(DatabaseManager::shared().background().has_value());
  auto persisted = NativeConfigStore::load();
  REQUIRE(persisted.has_value());
  REQUIRE_FALSE(persisted->background.has_value());
}

TEST_CASE("configure() with background omits optional requiresNetwork/requiresCharging as false", "[database][background]") {
  HybridDatabaseHarness harness;
  createDb(harness);

  harness.run(R"(db.configure({
    name: ')" + uniqueDbName("background_defaults") + R"(',
    background: { minimumInterval: 60000 }
  }))");

  auto background = DatabaseManager::shared().background();
  REQUIRE(background.has_value());
  REQUIRE(background->minimumIntervalMs == 60000.0);
  REQUIRE(background->requiresNetwork == false);
  REQUIRE(background->requiresCharging == false);
}
