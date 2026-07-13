#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/SyncOperationApplier.hpp"
#include <memory>

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbPath(const std::string& testName) {
  static int counter = 0;
  return platform::getDocumentsDirectory() + "/" + testName + "_" + std::to_string(++counter) + ".db";
}

std::shared_ptr<SQLiteConnection> openWithCustomers(const std::string& testName) {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath(testName));
  MigrationEngine engine(conn);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": {
      "id": { "type": "text" },
      "name": { "type": "text" },
      "updatedAt": { "type": "datetime", "nullable": false }
    },
    "sync": { "enabled": true }
  })"));
  return conn;
}

std::optional<std::string> nameOf(SQLiteConnection& conn, const std::string& id) {
  auto rows = conn.execute("SELECT name FROM customers WHERE id = ?", { id });
  if (rows.rows.empty()) return std::nullopt;
  return std::get<std::string>(rows.rows[0][0]);
}

} // namespace

TEST_CASE("apply inserts a row that doesn't exist locally", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_insert");
  SyncOperationApplier applier(conn);

  auto ops = json::parse(R"([
    { "operation": "insert", "entity": "customers", "primaryKey": "1",
      "payload": { "id": "1", "name": "alice", "updatedAt": 100 }, "updatedAt": 100 }
  ])").asArray();

  auto stats = applier.apply("customers", ops);
  REQUIRE(stats.inserted == 1);
  REQUIRE(stats.updated == 0);
  REQUIRE(nameOf(*conn, "1") == "alice");
}

TEST_CASE("apply updates an existing row when the remote updatedAt is newer", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_update_wins");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'old-name', 100)", {});
  SyncOperationApplier applier(conn);

  auto ops = json::parse(R"([
    { "operation": "update", "entity": "customers", "primaryKey": "1",
      "payload": { "id": "1", "name": "new-name", "updatedAt": 200 }, "updatedAt": 200 }
  ])").asArray();

  auto stats = applier.apply("customers", ops);
  REQUIRE(stats.updated == 1);
  REQUIRE(stats.inserted == 0);
  REQUIRE(nameOf(*conn, "1") == "new-name");
}

TEST_CASE("apply skips a stale update older than the local row (lastWriteWins)", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_update_stale");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'local-newer', 200)", {});
  SyncOperationApplier applier(conn);

  auto ops = json::parse(R"([
    { "operation": "update", "entity": "customers", "primaryKey": "1",
      "payload": { "id": "1", "name": "stale-remote", "updatedAt": 100 }, "updatedAt": 100 }
  ])").asArray();

  auto stats = applier.apply("customers", ops);
  REQUIRE(stats.updated == 0);
  REQUIRE(nameOf(*conn, "1") == "local-newer");
}

TEST_CASE("apply deletes a row when the remote updatedAt is not older than local", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_delete");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});
  SyncOperationApplier applier(conn);

  auto ops = json::parse(R"([
    { "operation": "delete", "entity": "customers", "primaryKey": "1",
      "payload": { "id": "1" }, "updatedAt": 150 }
  ])").asArray();

  auto stats = applier.apply("customers", ops);
  REQUIRE(stats.deleted == 1);
  REQUIRE_FALSE(nameOf(*conn, "1").has_value());
}

TEST_CASE("apply ignores a delete for a row that no longer exists locally", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_delete_missing");
  SyncOperationApplier applier(conn);

  auto ops = json::parse(R"([
    { "operation": "delete", "entity": "customers", "primaryKey": "1",
      "payload": { "id": "1" }, "updatedAt": 100 }
  ])").asArray();

  auto stats = applier.apply("customers", ops);
  REQUIRE(stats.deleted == 0);
}

TEST_CASE("apply does not delete on a tie — local wins, same rule as insert/update", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_delete_tie");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 150)", {});
  SyncOperationApplier applier(conn);

  auto ops = json::parse(R"([
    { "operation": "delete", "entity": "customers", "primaryKey": "1",
      "payload": { "id": "1" }, "updatedAt": 150 }
  ])").asArray();

  auto stats = applier.apply("customers", ops);
  REQUIRE(stats.deleted == 0);
  REQUIRE(nameOf(*conn, "1") == "a");
}

TEST_CASE("apply rejects an operation whose entity does not match the schema being synced", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_entity_mismatch");
  SyncOperationApplier applier(conn);

  auto ops = json::parse(R"([
    { "operation": "insert", "entity": "_sync_apply_lock", "primaryKey": "1",
      "payload": { "id": "1" }, "updatedAt": 100 }
  ])").asArray();

  REQUIRE_THROWS_AS(applier.apply("customers", ops), std::runtime_error);
}

TEST_CASE("apply rejects a payload column that isn't a real column on the table", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_unknown_column");
  SyncOperationApplier applier(conn);

  auto ops = json::parse(R"([
    { "operation": "insert", "entity": "customers", "primaryKey": "1",
      "payload": { "id": "1", "name": "alice", "updatedAt": 100, "notAColumn": "x" }, "updatedAt": 100 }
  ])").asArray();

  REQUIRE_THROWS_AS(applier.apply("customers", ops), std::runtime_error);
}
