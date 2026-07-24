#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/SyncApplyGuard.hpp"
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

TEST_CASE("applyAck preserves a large numeric server id without scientific-notation corruption", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_ack_large_numeric_id");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  auto acks = json::parse(R"([
    { "localId": "temp-1", "id": 1500000000000000, "name": "alice", "updatedAt": 100 }
  ])").asArray();

  SyncApplyGuard(conn).applyWithBypass([&] { applier.applyAck("customers", acks); });

  REQUIRE(nameOf(*conn, "1500000000000000") == "alice");

  auto meta = conn->execute(
    "SELECT entityId FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = 'temp-1'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "1500000000000000");
}

TEST_CASE("applyAck replaces a temp id with the server id and marks metadata SYNCED", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_ack_replace");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  auto acks = json::parse(R"([
    { "localId": "temp-1", "id": "srv-1", "name": "alice", "updatedAt": 100 }
  ])").asArray();

  ApplyStats stats;
  SyncApplyGuard(conn).applyWithBypass([&] {
    stats = applier.applyAck("customers", acks);
  });

  REQUIRE(stats.updated == 1);
  REQUIRE(nameOf(*conn, "srv-1") == "alice");
  REQUIRE_FALSE(nameOf(*conn, "temp-1").has_value());

  auto meta = conn->execute(
    "SELECT entityId, remoteId, status FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = 'temp-1'", {});
  REQUIRE(meta.rows.size() == 1);
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "srv-1");
  REQUIRE(std::get<std::string>(meta.rows[0][1]) == "srv-1");
  REQUIRE(std::get<std::string>(meta.rows[0][2]) == "SYNCED");
}

TEST_CASE("applyAck does not duplicate the metadata row or touch sync_queue", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_ack_no_duplication");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  auto queueBefore = conn->execute("SELECT COUNT(*) FROM sync_queue WHERE entity = 'customers'", {});

  auto acks = json::parse(R"([
    { "localId": "temp-1", "id": "srv-1", "name": "alice", "updatedAt": 100 }
  ])").asArray();
  SyncApplyGuard(conn).applyWithBypass([&] { applier.applyAck("customers", acks); });

  auto metaCount = conn->execute("SELECT COUNT(*) FROM _salve_sync_metadata WHERE tableName = 'customers'", {});
  REQUIRE(std::get<double>(metaCount.rows[0][0]) == 1.0);

  auto queueAfter = conn->execute("SELECT COUNT(*) FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(std::get<double>(queueAfter.rows[0][0]) == std::get<double>(queueBefore.rows[0][0]));
}

TEST_CASE("applyAck cascades child FK rewrites via RelationCascadeRewriter", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_ack_cascade");
  MigrationEngine engine(conn);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": {
      "id": { "type": "text" },
      "customerId": { "type": "text" },
      "updatedAt": { "type": "datetime", "nullable": false }
    },
    "relations": [ { "column": "customerId", "references": "customers" } ],
    "sync": { "enabled": true }
  })"));

  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  conn->execute("INSERT INTO orders (id, customerId, updatedAt) VALUES ('ord-1', 'temp-1', 100)", {});

  SyncOperationApplier applier(conn);
  auto acks = json::parse(R"([{ "localId": "temp-1", "id": "srv-1", "name": "alice", "updatedAt": 100 }])").asArray();
  SyncApplyGuard(conn).applyWithBypass([&] { applier.applyAck("customers", acks); });

  auto order = conn->execute("SELECT customerId FROM orders WHERE id = 'ord-1'", {});
  REQUIRE(std::get<std::string>(order.rows[0][0]) == "srv-1");
}

TEST_CASE("applyAck marks a soft-deleted row's metadata synced without erroring", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_ack_soft_delete");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'alice', 100)", {});
  conn->execute("DELETE FROM customers WHERE id = '1'", {});
  SyncOperationApplier applier(conn);

  auto acks = json::parse(R"([{ "localId": "1" }])").asArray();

  REQUIRE_NOTHROW(SyncApplyGuard(conn).applyWithBypass([&] {
    applier.applyAck("customers", acks);
  }));

  auto meta = conn->execute(
    "SELECT status, syncedAt FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = '1'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "DELETED");
  REQUIRE(std::get<double>(meta.rows[0][1]) != 0.0);
}

TEST_CASE("applyAck rejects an unknown ack column", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_ack_unknown_column");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  auto acks = json::parse(R"([{ "localId": "temp-1", "id": "srv-1", "notAColumn": "x", "updatedAt": 100 }])").asArray();

  REQUIRE_THROWS_AS(
    SyncApplyGuard(conn).applyWithBypass([&] { applier.applyAck("customers", acks); }),
    std::runtime_error
  );
}

TEST_CASE("applyAck rejects an ack whose localId has no matching metadata", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_ack_orphan");
  SyncOperationApplier applier(conn);

  auto acks = json::parse(R"([{ "localId": "ghost", "id": "srv-1", "updatedAt": 100 }])").asArray();

  REQUIRE_THROWS_AS(
    SyncApplyGuard(conn).applyWithBypass([&] { applier.applyAck("customers", acks); }),
    std::runtime_error
  );
}

TEST_CASE("a real edit after replace updates the same frozen localId row instead of duplicating it", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_ack_post_replace_edit");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  auto acks = json::parse(R"([{ "localId": "temp-1", "id": "srv-1", "name": "alice", "updatedAt": 100 }])").asArray();
  SyncApplyGuard(conn).applyWithBypass([&] { applier.applyAck("customers", acks); });

  // Real edit, outside the bypass — fires the update trigger normally.
  conn->execute("UPDATE customers SET name = 'alice-v2', updatedAt = 200 WHERE id = 'srv-1'", {});

  auto count = conn->execute("SELECT COUNT(*) FROM _salve_sync_metadata WHERE tableName = 'customers'", {});
  REQUIRE(std::get<double>(count.rows[0][0]) == 1.0);

  auto meta = conn->execute("SELECT localId, status FROM _salve_sync_metadata WHERE tableName = 'customers'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "temp-1");
  REQUIRE(std::get<std::string>(meta.rows[0][1]) == "PENDING");
}
