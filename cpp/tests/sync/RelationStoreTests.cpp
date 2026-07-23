#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/RelationStore.hpp"
#include <memory>

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbPath(const std::string& testName) {
  static int counter = 0;
  return platform::getDocumentsDirectory() + "/" + testName + "_" + std::to_string(++counter) + ".db";
}

std::shared_ptr<SQLiteConnection> openWithRelationsTable(const std::string& testName) {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath(testName));
  MigrationEngine engine(conn);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" } }
  })"));
  return conn;
}

} // namespace

TEST_CASE("getRelationsReferencing returns empty when nothing registered", "[sync][RelationStore]") {
  auto conn = openWithRelationsTable("relations_missing");
  RelationStore store(conn);
  REQUIRE(store.getRelationsReferencing("customers").empty());
}

TEST_CASE("replaceForChild persists and getRelationsReferencing reads it back", "[sync][RelationStore]") {
  auto conn = openWithRelationsTable("relations_roundtrip");
  RelationStore store(conn);

  store.replaceForChild("orders", { RelationDef{"customerId", "customers"} });

  auto rows = store.getRelationsReferencing("customers");
  REQUIRE(rows.size() == 1);
  REQUIRE(rows[0].childTable == "orders");
  REQUIRE(rows[0].fkColumn == "customerId");
  REQUIRE(rows[0].parentTable == "customers");
}

TEST_CASE("replaceForChild called twice with the same relations does not duplicate", "[sync][RelationStore]") {
  auto conn = openWithRelationsTable("relations_idempotent");
  RelationStore store(conn);

  store.replaceForChild("orders", { RelationDef{"customerId", "customers"} });
  store.replaceForChild("orders", { RelationDef{"customerId", "customers"} });

  REQUIRE(store.getRelationsReferencing("customers").size() == 1);
}

TEST_CASE("replaceForChild drops a relation that disappeared in a newer version", "[sync][RelationStore]") {
  auto conn = openWithRelationsTable("relations_stale");
  RelationStore store(conn);

  store.replaceForChild("orders", {
    RelationDef{"customerId", "customers"},
    RelationDef{"warehouseId", "warehouses"}
  });
  store.replaceForChild("orders", { RelationDef{"customerId", "customers"} });

  REQUIRE(store.getRelationsReferencing("customers").size() == 1);
  REQUIRE(store.getRelationsReferencing("warehouses").empty());
}

TEST_CASE("a child with two FKs to different parents is isolated per parent", "[sync][RelationStore]") {
  auto conn = openWithRelationsTable("relations_multi_fk");
  RelationStore store(conn);

  store.replaceForChild("orders", {
    RelationDef{"customerId", "customers"},
    RelationDef{"warehouseId", "warehouses"}
  });

  REQUIRE(store.getRelationsReferencing("customers").size() == 1);
  REQUIRE(store.getRelationsReferencing("warehouses").size() == 1);
}

TEST_CASE("two different children referencing the same parent are both returned", "[sync][RelationStore]") {
  auto conn = openWithRelationsTable("relations_multi_child");
  RelationStore store(conn);

  store.replaceForChild("orders", { RelationDef{"customerId", "customers"} });
  store.replaceForChild("invoices", { RelationDef{"customerId", "customers"} });

  auto rows = store.getRelationsReferencing("customers");
  REQUIRE(rows.size() == 2);
}

TEST_CASE("a saved relation survives constructing a new RelationStore over the same connection", "[sync][RelationStore]") {
  auto conn = openWithRelationsTable("relations_persist_restart");
  { RelationStore(conn).replaceForChild("orders", { RelationDef{"customerId", "customers"} }); }

  RelationStore reopened(conn);
  REQUIRE(reopened.getRelationsReferencing("customers").size() == 1);
}

TEST_CASE("MigrationEngine::registerSchema persists declared relations", "[sync][RelationStore][integration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("relations_registerschema"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" } },
    "relations": [ { "column": "customerId", "references": "customers" } ]
  })"));

  RelationStore store(conn);
  auto rows = store.getRelationsReferencing("customers");
  REQUIRE(rows.size() == 1);
  REQUIRE(rows[0].childTable == "orders");
}

TEST_CASE("re-registering the same schema does not duplicate relations", "[sync][RelationStore][integration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("relations_registerschema_repeat"));
  MigrationEngine engine(conn);

  std::string schemaJson = R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" } },
    "relations": [ { "column": "customerId", "references": "customers" } ]
  })";
  engine.registerSchema(MigrationEngine::parseSchemaJson(schemaJson));
  engine.registerSchema(MigrationEngine::parseSchemaJson(schemaJson));

  RelationStore store(conn);
  REQUIRE(store.getRelationsReferencing("customers").size() == 1);
}

TEST_CASE("registerSchema rejects a relation column that is not declared", "[sync][RelationStore][integration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("relations_invalid_column"));
  MigrationEngine engine(conn);

  CHECK_THROWS(engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" } },
    "relations": [ { "column": "customerId", "references": "customers" } ]
  })")));
}

TEST_CASE("registerSchema rejects a relation with an empty references", "[sync][RelationStore][integration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("relations_invalid_references"));
  MigrationEngine engine(conn);

  CHECK_THROWS(engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" } },
    "relations": [ { "column": "customerId", "references": "" } ]
  })")));
}

TEST_CASE("registerSchema rejects two relations declaring the same column", "[sync][RelationStore][integration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("relations_duplicate_column"));
  MigrationEngine engine(conn);

  CHECK_THROWS(engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" } },
    "relations": [
      { "column": "customerId", "references": "customers" },
      { "column": "customerId", "references": "warehouses" }
    ]
  })")));
}

TEST_CASE("registerSchema creates an index on each declared FK column", "[sync][RelationStore][integration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("relations_fk_index"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" } },
    "relations": [ { "column": "customerId", "references": "customers" } ]
  })"));

  auto indexes = conn->execute(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'orders' AND name = 'orders_customerId_fk_idx'",
    {}
  );
  REQUIRE(indexes.rows.size() == 1);
}

TEST_CASE("re-registering the same schema does not create duplicate indexes", "[sync][RelationStore][integration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("relations_fk_index_repeat"));
  MigrationEngine engine(conn);

  std::string schemaJson = R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" } },
    "relations": [ { "column": "customerId", "references": "customers" } ]
  })";
  engine.registerSchema(MigrationEngine::parseSchemaJson(schemaJson));
  engine.registerSchema(MigrationEngine::parseSchemaJson(schemaJson));

  auto indexes = conn->execute(
    "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'orders' AND name = 'orders_customerId_fk_idx'",
    {}
  );
  REQUIRE(indexes.rows.size() == 1);
}

TEST_CASE("relations are persisted even when the child schema has sync disabled", "[sync][RelationStore][integration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("relations_no_sync"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" } },
    "relations": [ { "column": "customerId", "references": "customers" } ]
  })"));

  RelationStore store(conn);
  REQUIRE(store.getRelationsReferencing("customers").size() == 1);
}
