#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/SyncDefinitionStore.hpp"
#include <algorithm>
#include <memory>

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbPath(const std::string& testName) {
  static int counter = 0;
  return platform::getDocumentsDirectory() + "/" + testName + "_" + std::to_string(++counter) + ".db";
}

std::shared_ptr<SQLiteConnection> openWithDefinitionTable(const std::string& testName) {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath(testName));
  MigrationEngine engine(conn);
  // registerSchema creates the global sync tables (_salve_sync_definitions included).
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" } }
  })"));
  return conn;
}

json::Value contract(const std::string& path, bool includePagination) {
  std::string json = R"({"enabled": true, "endpoint": {"method": "POST", "path": ")" + path + R"("}})";
  if (includePagination) {
    json = R"({"enabled": true, "endpoint": {"method": "POST", "path": ")" + path +
           R"("}, "pagination": {"pageSize": 10}})";
  }
  return json::parse(json);
}

} // namespace

TEST_CASE("definitionFor returns nullopt for a schema never registered", "[sync][SyncDefinitionStore]") {
  auto conn = openWithDefinitionTable("definition_missing");
  SyncDefinitionStore store(conn);
  REQUIRE_FALSE(store.definitionFor("customers").has_value());
}

TEST_CASE("save/definitionFor round-trips a full contract", "[sync][SyncDefinitionStore]") {
  auto conn = openWithDefinitionTable("definition_roundtrip");
  SyncDefinitionStore store(conn);

  store.save("customers", contract("/sync/customers", true));

  auto def = store.definitionFor("customers");
  REQUIRE(def.has_value());
  REQUIRE(def->getBool("enabled") == true);
  REQUIRE(def->get("endpoint")->get().getString("path") == "/sync/customers");
  REQUIRE(def->get("pagination")->get().getNumber("pageSize") == 10.0);
}

TEST_CASE("save fully replaces a prior definition — never merges fields", "[sync][SyncDefinitionStore]") {
  auto conn = openWithDefinitionTable("definition_replace");
  SyncDefinitionStore store(conn);

  store.save("customers", contract("/sync/A", true));
  store.save("customers", contract("/sync/B", false)); // no pagination this time

  auto def = store.definitionFor("customers");
  REQUIRE(def->get("endpoint")->get().getString("path") == "/sync/B");
  REQUIRE_FALSE(def->get("pagination").has_value()); // old field did not survive
}

TEST_CASE("definitions are isolated per schema name", "[sync][SyncDefinitionStore]") {
  auto conn = openWithDefinitionTable("definition_per_entity");
  SyncDefinitionStore store(conn);

  store.save("customers", contract("/sync/customers", false));
  store.save("orders", contract("/sync/orders", false));

  REQUIRE(store.definitionFor("customers")->get("endpoint")->get().getString("path") == "/sync/customers");
  REQUIRE(store.definitionFor("orders")->get("endpoint")->get().getString("path") == "/sync/orders");
}

TEST_CASE("a saved definition survives constructing a new SyncDefinitionStore over the same connection", "[sync][SyncDefinitionStore]") {
  auto conn = openWithDefinitionTable("definition_persists_restart");
  { SyncDefinitionStore(conn).save("customers", contract("/sync/customers", false)); }

  SyncDefinitionStore reopened(conn);
  REQUIRE(reopened.definitionFor("customers")->get("endpoint")->get().getString("path") == "/sync/customers");
}

TEST_CASE("enabledSchemas returns exactly the saved schemas, never a disabled one", "[sync][SyncDefinitionStore]") {
  auto conn = openWithDefinitionTable("definition_enabled_schemas");
  SyncDefinitionStore store(conn);

  store.save("customers", contract("/sync/customers", false));
  store.save("orders", contract("/sync/orders", false));
  // Never saved: MigrationEngine only calls save() when sync.enabled is
  // true (see the [integration] test below) — a disabled schema is simply
  // absent from this table, not present with enabled=false.

  auto names = store.enabledSchemas();
  std::sort(names.begin(), names.end());
  REQUIRE(names == std::vector<std::string>{"customers", "orders"});
}

TEST_CASE("MigrationEngine::registerSchema captures the full sync contract", "[sync][SyncDefinitionStore][integration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("definition_registerschema_capture"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": {
      "enabled": true,
      "endpoint": { "method": "POST", "path": "/sync/customers" },
      "pagination": { "pageSize": 50 }
    }
  })"));

  SyncDefinitionStore store(conn);
  auto def = store.definitionFor("customers");
  REQUIRE(def.has_value());
  REQUIRE(def->getBool("enabled") == true);
  REQUIRE(def->get("endpoint")->get().getString("path") == "/sync/customers");
  REQUIRE(def->get("pagination")->get().getNumber("pageSize") == 50.0);
}

TEST_CASE("MigrationEngine::registerSchema removes the definition when sync.enabled is false", "[sync][SyncDefinitionStore][integration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("definition_registerschema_disable"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": { "enabled": true }
  })"));
  SyncDefinitionStore store(conn);
  REQUIRE(store.definitionFor("customers").has_value());

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 2, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": { "enabled": false }
  })"));
  REQUIRE_FALSE(store.definitionFor("customers").has_value());
}
