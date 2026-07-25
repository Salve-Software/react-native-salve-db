#include <catch2/catch_test_macros.hpp>
#include "../../database/DatabaseManager.hpp"
#include "../support/HybridDatabaseHarness.hpp"

using margelo::nitro::salvedb::DatabaseManager;
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

TEST_CASE("configure() with baseUrl and network populates DatabaseManager's NetworkConfig", "[database][network]") {
  HybridDatabaseHarness harness;
  createDb(harness);

  harness.run(R"(db.configure({
    name: ')" + uniqueDbName("network") + R"(',
    baseUrl: 'https://api.company.com',
    network: { timeout: 8000 }
  }))");

  const auto& network = DatabaseManager::shared().network();
  REQUIRE(network.baseUrl == "https://api.company.com");
  REQUIRE(network.timeoutMs == 8000.0);
}

TEST_CASE("configure() throws when only baseUrl is provided", "[database][network]") {
  HybridDatabaseHarness harness;
  createDb(harness);

  REQUIRE_THROWS(harness.run(R"(db.configure({
    name: ')" + uniqueDbName("network_partial_a") + R"(',
    baseUrl: 'https://api.company.com'
  }))"));
}

TEST_CASE("configure() throws when only network is provided", "[database][network]") {
  HybridDatabaseHarness harness;
  createDb(harness);

  REQUIRE_THROWS(harness.run(R"(db.configure({
    name: ')" + uniqueDbName("network_partial_b") + R"(',
    network: { timeout: 8000 }
  }))"));
}

TEST_CASE("configure() validates baseUrl/network before opening the database", "[database][network]") {
  HybridDatabaseHarness harness;
  createDb(harness);

  harness.run("db.configure({ name: '" + uniqueDbName("network_ordering_good") + "' })");
  auto connectionBefore = DatabaseManager::shared().connection();

  // A bad baseUrl/network pairing must throw before open() switches the
  // connection to the new (differently-named) database.
  REQUIRE_THROWS(harness.run(R"(db.configure({
    name: ')" + uniqueDbName("network_ordering_bad") + R"(',
    baseUrl: 'https://api.company.com'
  }))"));

  REQUIRE(DatabaseManager::shared().connection() == connectionBefore);
}
