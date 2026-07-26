#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/RelationCascadeRewriter.hpp"
#include "../../sync/RelationStore.hpp"
#include "../../sync/SyncApplyGuard.hpp"
#include <memory>

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbPath(const std::string& testName) {
  static int counter = 0;
  return platform::getDocumentsDirectory() + "/" + testName + "_" + std::to_string(++counter) + ".db";
}

} // namespace

TEST_CASE("rewrite updates only child rows whose FK matches oldId", "[sync][RelationCascadeRewriter]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("cascade_single_child"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" } }
  })"));
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" } },
    "relations": [ { "column": "customerId", "references": "customers" } ]
  })"));

  conn->execute("INSERT INTO orders (id, customerId) VALUES ('ord-1', 'temp-cust')", {});
  conn->execute("INSERT INTO orders (id, customerId) VALUES ('ord-2', 'other-cust')", {});

  RelationCascadeRewriter(conn).rewrite("customers", "temp-cust", "cust-1");

  auto ord1 = conn->execute("SELECT customerId FROM orders WHERE id = 'ord-1'", {});
  REQUIRE(std::get<std::string>(ord1.rows[0][0]) == "cust-1");
  auto ord2 = conn->execute("SELECT customerId FROM orders WHERE id = 'ord-2'", {});
  REQUIRE(std::get<std::string>(ord2.rows[0][0]) == "other-cust");
}

TEST_CASE("cascade converges across a grandparent -> parent -> child chain via sequential syncs", "[sync][RelationCascadeRewriter]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("cascade_multilevel"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "companies", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" } }
  })"));
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "companyId": { "type": "text" } },
    "relations": [ { "column": "companyId", "references": "companies" } ]
  })"));
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" } },
    "relations": [ { "column": "customerId", "references": "customers" } ]
  })"));

  conn->execute("INSERT INTO customers (id, companyId) VALUES ('temp-cust', 'temp-co')", {});
  conn->execute("INSERT INTO orders (id, customerId) VALUES ('ord-1', 'temp-cust')", {});

  RelationCascadeRewriter rewriter(conn);
  rewriter.rewrite("companies", "temp-co", "co-1");

  auto customer = conn->execute("SELECT companyId FROM customers WHERE id = 'temp-cust'", {});
  REQUIRE(std::get<std::string>(customer.rows[0][0]) == "co-1");

  rewriter.rewrite("customers", "temp-cust", "cust-1");

  auto order = conn->execute("SELECT customerId FROM orders WHERE id = 'ord-1'", {});
  REQUIRE(std::get<std::string>(order.rows[0][0]) == "cust-1");
}

TEST_CASE("rewrite only touches the FK matching the syncing parent, not a sibling FK", "[sync][RelationCascadeRewriter]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("cascade_multi_fk"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" } }
  })"));
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "warehouses", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" } }
  })"));
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" }, "warehouseId": { "type": "text" } },
    "relations": [
      { "column": "customerId", "references": "customers" },
      { "column": "warehouseId", "references": "warehouses" }
    ]
  })"));

  conn->execute("INSERT INTO orders (id, customerId, warehouseId) VALUES ('ord-1', 'temp-cust', 'temp-wh')", {});

  RelationCascadeRewriter(conn).rewrite("customers", "temp-cust", "cust-1");

  auto row = conn->execute("SELECT customerId, warehouseId FROM orders WHERE id = 'ord-1'", {});
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "cust-1");
  REQUIRE(std::get<std::string>(row.rows[0][1]) == "temp-wh");
}

TEST_CASE("rewrite updates every child table referencing the same parent", "[sync][RelationCascadeRewriter]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("cascade_multi_child"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" } }
  })"));
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" } },
    "relations": [ { "column": "customerId", "references": "customers" } ]
  })"));
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "invoices", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" } },
    "relations": [ { "column": "customerId", "references": "customers" } ]
  })"));

  conn->execute("INSERT INTO orders (id, customerId) VALUES ('ord-1', 'temp-cust')", {});
  conn->execute("INSERT INTO invoices (id, customerId) VALUES ('inv-1', 'temp-cust')", {});

  RelationCascadeRewriter(conn).rewrite("customers", "temp-cust", "cust-1");

  auto order = conn->execute("SELECT customerId FROM orders WHERE id = 'ord-1'", {});
  REQUIRE(std::get<std::string>(order.rows[0][0]) == "cust-1");
  auto invoice = conn->execute("SELECT customerId FROM invoices WHERE id = 'inv-1'", {});
  REQUIRE(std::get<std::string>(invoice.rows[0][0]) == "cust-1");
}

TEST_CASE("rewrite on a parent with no registered children touches no table", "[sync][RelationCascadeRewriter]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("cascade_no_relations"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" } }
  })"));
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" } }
  })"));
  conn->execute("INSERT INTO orders (id, customerId) VALUES ('ord-1', 'temp-cust')", {});

  RelationCascadeRewriter(conn).rewrite("customers", "temp-cust", "cust-1");

  REQUIRE(RelationStore(conn).getRelationsReferencing("customers").empty());
  auto row = conn->execute("SELECT customerId FROM orders WHERE id = 'ord-1'", {});
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "temp-cust");
}

TEST_CASE("rewrite with an oldId matching no row changes nothing", "[sync][RelationCascadeRewriter]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("cascade_no_match"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" } }
  })"));
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" } },
    "relations": [ { "column": "customerId", "references": "customers" } ]
  })"));

  conn->execute("INSERT INTO orders (id, customerId) VALUES ('ord-1', 'other-cust')", {});

  RelationCascadeRewriter(conn).rewrite("customers", "temp-cust", "cust-1");

  auto row = conn->execute("SELECT customerId FROM orders WHERE id = 'ord-1'", {});
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "other-cust");
}

TEST_CASE("rewrite converts the new id via the child column's integer affinity", "[sync][RelationCascadeRewriter]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("cascade_integer_fk"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" } }
  })"));
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "integer" } },
    "relations": [ { "column": "customerId", "references": "customers" } ]
  })"));

  conn->execute("INSERT INTO orders (id, customerId) VALUES ('ord-1', 'temp-cust')", {});

  RelationCascadeRewriter(conn).rewrite("customers", "temp-cust", "145");

  auto row = conn->execute("SELECT customerId FROM orders WHERE id = 'ord-1'", {});
  REQUIRE(std::get<double>(row.rows[0][0]) == 145.0);
}

TEST_CASE("rewrite performed inside applyWithBypass does not re-enqueue the rewritten child", "[sync][RelationCascadeRewriter]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("cascade_bypass"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" } }
  })"));
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "customerId": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "relations": [ { "column": "customerId", "references": "customers" } ],
    "sync": { "enabled": true }
  })"));

  conn->execute("INSERT INTO orders (id, customerId, updatedAt) VALUES ('ord-1', 'temp-cust', 100)", {});
  conn->execute("DELETE FROM sync_queue WHERE entity = 'orders'", {});
  conn->execute("DELETE FROM _salve_sync_metadata WHERE tableName = 'orders'", {});

  SyncApplyGuard(conn).applyWithBypass([&] {
    RelationCascadeRewriter(conn).rewrite("customers", "temp-cust", "cust-1");
  });

  auto queued = conn->execute("SELECT COUNT(*) FROM sync_queue WHERE entity = 'orders'", {});
  REQUIRE(std::get<double>(queued.rows[0][0]) == 0.0);
  auto metadata = conn->execute("SELECT COUNT(*) FROM _salve_sync_metadata WHERE tableName = 'orders'", {});
  REQUIRE(std::get<double>(metadata.rows[0][0]) == 0.0);

  auto row = conn->execute("SELECT customerId FROM orders WHERE id = 'ord-1'", {});
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "cust-1");
}
