#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/SyncQueueReader.hpp"
#include <memory>

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbPath(const std::string& testName) {
  static int counter = 0;
  return platform::getDocumentsDirectory() + "/" + testName + "_" + std::to_string(++counter) + ".db";
}

void registerSyncEnabledCustomers(MigrationEngine& engine) {
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "name": { "type": "text" }, "updatedAt": { "type": "datetime" } },
    "sync": { "enabled": true }
  })"));
}

} // namespace

TEST_CASE("readOperations serializes sync_queue rows to the ISyncOperation shape", "[sync][SyncQueueReader]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("reader_shape"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);

  conn->execute("INSERT INTO customers (id, name) VALUES (1, 'a')", {});

  SyncQueueReader reader(conn);
  auto ops = reader.readOperations(10);

  REQUIRE(ops.size() == 1);
  const auto& op = ops[0].asObject();
  REQUIRE(op.at("operation").asString() == "insert");
  REQUIRE(op.at("entity").asString() == "customers");
  REQUIRE(op.at("primaryKey").asString() == "1");
  REQUIRE(op.at("payload").isObject());
  REQUIRE(op.at("updatedAt").isNumber());
}

TEST_CASE("readOperations respects the limit and returns oldest-first", "[sync][SyncQueueReader]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("reader_limit"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);

  conn->execute("INSERT INTO customers (id, name) VALUES (1, 'a')", {});
  conn->execute("INSERT INTO customers (id, name) VALUES (2, 'b')", {});
  conn->execute("INSERT INTO customers (id, name) VALUES (3, 'c')", {});

  SyncQueueReader reader(conn);
  auto ops = reader.readOperations(2);

  REQUIRE(ops.size() == 2);
  REQUIRE(ops[0].asObject().at("primaryKey").asString() == "1");
  REQUIRE(ops[1].asObject().at("primaryKey").asString() == "2");
}

TEST_CASE("readOperations does not mutate sync_queue", "[sync][SyncQueueReader]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("reader_readonly"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);

  conn->execute("INSERT INTO customers (id, name) VALUES (1, 'a')", {});

  SyncQueueReader reader(conn);
  reader.readOperations(10);

  auto rows = conn->execute("SELECT COUNT(*) FROM sync_queue", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 1.0);
}

TEST_CASE("readOperations rejects a negative limit", "[sync][SyncQueueReader]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("reader_negative_limit"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);

  conn->execute("INSERT INTO customers (id, name) VALUES (1, 'a')", {});

  SyncQueueReader reader(conn);
  REQUIRE_THROWS_AS(reader.readOperations(-1), std::runtime_error);
}

TEST_CASE("readOperations with limit 0 returns an empty array", "[sync][SyncQueueReader]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("reader_zero_limit"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);

  conn->execute("INSERT INTO customers (id, name) VALUES (1, 'a')", {});

  SyncQueueReader reader(conn);
  auto ops = reader.readOperations(0);
  REQUIRE(ops.empty());
}

TEST_CASE("readPage filters by entity", "[sync][SyncQueueReader]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("reader_page_entity"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "updatedAt": { "type": "datetime" } },
    "sync": { "enabled": true }
  })"));

  conn->execute("INSERT INTO customers (id, name) VALUES (1, 'a')", {});
  conn->execute("INSERT INTO orders (id) VALUES (100)", {});

  SyncQueueReader reader(conn);
  auto page = reader.readPage("customers", 10);

  REQUIRE(page.operations.size() == 1);
  REQUIRE(page.operations[0].asObject().at("entity").asString() == "customers");
}

TEST_CASE("readPage reports the highest row id in the page for the delete-after-apply cutoff", "[sync][SyncQueueReader]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("reader_page_maxid"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);

  conn->execute("INSERT INTO customers (id, name) VALUES (1, 'a')", {});
  conn->execute("INSERT INTO customers (id, name) VALUES (2, 'b')", {});
  conn->execute("INSERT INTO customers (id, name) VALUES (3, 'c')", {});

  SyncQueueReader reader(conn);
  auto page = reader.readPage("customers", 2);

  REQUIRE(page.operations.size() == 2);
  REQUIRE(page.maxId.has_value());
  REQUIRE(*page.maxId == 2);
}

TEST_CASE("readPage on an empty queue returns no maxId", "[sync][SyncQueueReader]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("reader_page_empty"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);

  SyncQueueReader reader(conn);
  auto page = reader.readPage("customers", 10);

  REQUIRE(page.operations.empty());
  REQUIRE_FALSE(page.maxId.has_value());
}
