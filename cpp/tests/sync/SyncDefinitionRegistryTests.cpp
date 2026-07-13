#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/SyncDefinitionRegistry.hpp"
#include <memory>

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbPath(const std::string& testName) {
  static int counter = 0;
  return platform::getDocumentsDirectory() + "/" + testName + "_" + std::to_string(++counter) + ".db";
}

} // namespace

TEST_CASE("registerDefinition/definitionFor/unregisterDefinition round-trip", "[sync][SyncDefinitionRegistry]") {
  SyncDefinitionRegistry::shared().clear();

  json::Object def;
  def["enabled"] = json::Value(true);
  SyncDefinitionRegistry::shared().registerDefinition("customers", json::Value(def));

  auto found = SyncDefinitionRegistry::shared().definitionFor("customers");
  REQUIRE(found.has_value());
  REQUIRE(found->getBool("enabled") == true);

  SyncDefinitionRegistry::shared().unregisterDefinition("customers");
  REQUIRE_FALSE(SyncDefinitionRegistry::shared().definitionFor("customers").has_value());
}

TEST_CASE("definitionFor returns nullopt for a schema never registered", "[sync][SyncDefinitionRegistry]") {
  SyncDefinitionRegistry::shared().clear();
  REQUIRE_FALSE(SyncDefinitionRegistry::shared().definitionFor("never_registered").has_value());
}

TEST_CASE("MigrationEngine::registerSchema captures the full sync contract", "[sync][SyncDefinitionRegistry][integration]") {
  SyncDefinitionRegistry::shared().clear();
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("registry_capture"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "updatedAt": { "type": "datetime" } },
    "sync": {
      "enabled": true,
      "endpoint": { "method": "POST", "path": "/sync/customers" },
      "pagination": { "pageSize": 50 }
    }
  })"));

  auto def = SyncDefinitionRegistry::shared().definitionFor("customers");
  REQUIRE(def.has_value());
  REQUIRE(def->getBool("enabled") == true);
  REQUIRE(def->get("endpoint")->get().getString("path") == "/sync/customers");
  REQUIRE(def->get("pagination")->get().getNumber("pageSize") == 50.0);
}

TEST_CASE("MigrationEngine::registerSchema unregisters when sync.enabled is false", "[sync][SyncDefinitionRegistry][integration]") {
  SyncDefinitionRegistry::shared().clear();
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("registry_disable"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "updatedAt": { "type": "datetime" } },
    "sync": { "enabled": true }
  })"));
  REQUIRE(SyncDefinitionRegistry::shared().definitionFor("customers").has_value());

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 2, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "updatedAt": { "type": "datetime" } },
    "sync": { "enabled": false }
  })"));
  REQUIRE_FALSE(SyncDefinitionRegistry::shared().definitionFor("customers").has_value());
}
