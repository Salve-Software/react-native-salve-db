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

std::optional<double> deletedAtOf(SQLiteConnection& conn, const std::string& id) {
  auto rows = conn.execute("SELECT deletedAt FROM customers WHERE id = ?", { id });
  if (rows.rows.empty()) return std::nullopt;
  if (std::holds_alternative<margelo::nitro::NullType>(rows.rows[0][0])) return std::nullopt;
  return std::get<double>(rows.rows[0][0]);
}

// Composes the two split steps the way SyncPushPhase does, for tests that only care about the happy path.
void applyReplace(SyncOperationApplier& applier, const std::string& entity, const std::string& localId, const json::Value& response) {
  auto identity = applier.recordRemoteSuccess(entity, localId, response);
  applier.rewriteLocalRow(entity, identity, response);
}

} // namespace

TEST_CASE("apply inserts a row that doesn't exist locally", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_insert");
  SyncOperationApplier applier(conn);

  auto rows = json::parse(R"([{ "id": "1", "name": "alice", "updatedAt": 100 }])").asArray();

  auto stats = applier.apply("customers", rows);
  REQUIRE(stats.inserted == 1);
  REQUIRE(stats.updated == 0);
  REQUIRE(nameOf(*conn, "1") == "alice");
}

TEST_CASE("apply updates an existing row when the remote updatedAt is newer", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_update_wins");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'old-name', 100)", {});
  SyncOperationApplier applier(conn);

  auto rows = json::parse(R"([{ "id": "1", "name": "new-name", "updatedAt": 200 }])").asArray();

  auto stats = applier.apply("customers", rows);
  REQUIRE(stats.updated == 1);
  REQUIRE(stats.inserted == 0);
  REQUIRE(nameOf(*conn, "1") == "new-name");
}

TEST_CASE("apply skips a stale update older than the local row (lastWriteWins)", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_update_stale");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'local-newer', 200)", {});
  SyncOperationApplier applier(conn);

  auto rows = json::parse(R"([{ "id": "1", "name": "stale-remote", "updatedAt": 100 }])").asArray();

  auto stats = applier.apply("customers", rows);
  REQUIRE(stats.updated == 0);
  REQUIRE(nameOf(*conn, "1") == "local-newer");
}

TEST_CASE("apply soft-deletes via a tombstone when newer than the local row", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_tombstone");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});
  SyncOperationApplier applier(conn);

  // Real tombstone shape: {id, deletedAt} only — no updatedAt field.
  auto rows = json::parse(R"([{ "id": "1", "deletedAt": 150 }])").asArray();

  auto stats = applier.apply("customers", rows);
  REQUIRE(stats.deleted == 1);
  REQUIRE(deletedAtOf(*conn, "1") == 150.0);
  REQUIRE(nameOf(*conn, "1") == "a"); // soft-delete — row and other columns survive
}

TEST_CASE("apply ignores a tombstone for a row that does not exist locally", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_tombstone_missing");
  SyncOperationApplier applier(conn);

  auto rows = json::parse(R"([{ "id": "1", "deletedAt": 100 }])").asArray();

  auto stats = applier.apply("customers", rows);
  REQUIRE(stats.deleted == 0);
  REQUIRE_FALSE(nameOf(*conn, "1").has_value());
}

TEST_CASE("apply does not apply a tombstone on a tie — local wins, same rule as insert/update", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_tombstone_tie");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 150)", {});
  SyncOperationApplier applier(conn);

  auto rows = json::parse(R"([{ "id": "1", "deletedAt": 150 }])").asArray();

  auto stats = applier.apply("customers", rows);
  REQUIRE(stats.deleted == 0);
  REQUIRE_FALSE(deletedAtOf(*conn, "1").has_value());
}

TEST_CASE("apply ignores an unknown column from the server and still writes the known ones", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_unknown_column");
  SyncOperationApplier applier(conn);

  auto rows = json::parse(R"([{ "id": "1", "name": "alice", "updatedAt": 100, "notAColumn": "x" }])").asArray();

  REQUIRE_NOTHROW(applier.apply("customers", rows));
  REQUIRE(nameOf(*conn, "1") == "alice");
}

TEST_CASE("apply marks a newly inserted row's metadata SYNCED with remoteId=entityId=id", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_pulled_metadata_insert");
  SyncOperationApplier applier(conn);

  auto rows = json::parse(R"([{ "id": "srv-1", "name": "alice", "updatedAt": 100 }])").asArray();
  applier.apply("customers", rows);

  auto meta = conn->execute(
    "SELECT localId, entityId, remoteId, status FROM _salve_sync_metadata WHERE tableName = 'customers'", {});
  REQUIRE(meta.rows.size() == 1);
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "srv-1");
  REQUIRE(std::get<std::string>(meta.rows[0][1]) == "srv-1");
  REQUIRE(std::get<std::string>(meta.rows[0][2]) == "srv-1");
  REQUIRE(std::get<std::string>(meta.rows[0][3]) == "SYNCED");
}

TEST_CASE("apply marks an applied tombstone's metadata DELETED", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_pulled_metadata_tombstone");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});
  SyncOperationApplier applier(conn);

  auto rows = json::parse(R"([{ "id": "1", "deletedAt": 150 }])").asArray();
  applier.apply("customers", rows);

  auto meta = conn->execute(
    "SELECT status FROM _salve_sync_metadata WHERE tableName = 'customers' AND entityId = '1'", {});
  REQUIRE(meta.rows.size() == 1);
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "DELETED");
}

TEST_CASE("apply on a row already replaced locally updates its metadata instead of duplicating", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_pulled_metadata_conflict");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  SyncApplyGuard(conn).applyWithBypass([&] {
    applyReplace(applier, "customers", "temp-1", json::parse(R"({ "id": "srv-1", "name": "alice", "updatedAt": 100 })"));
  });

  // The server pulls back the same row it just acked.
  auto rows = json::parse(R"([{ "id": "srv-1", "name": "alice", "updatedAt": 100 }])").asArray();
  applier.apply("customers", rows);

  auto count = conn->execute("SELECT COUNT(*) FROM _salve_sync_metadata WHERE tableName = 'customers'", {});
  REQUIRE(std::get<double>(count.rows[0][0]) == 1.0);
}

TEST_CASE("applyReplace preserves a large numeric server id without scientific-notation corruption", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_replace_large_numeric_id");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  auto response = json::parse(R"({ "id": 1500000000000000, "name": "alice", "updatedAt": 100 })");

  SyncApplyGuard(conn).applyWithBypass([&] { applyReplace(applier, "customers", "temp-1", response); });

  REQUIRE(nameOf(*conn, "1500000000000000") == "alice");

  auto meta = conn->execute(
    "SELECT entityId FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = 'temp-1'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "1500000000000000");
}

TEST_CASE("applyReplace replaces a temp id with the server id and marks metadata SYNCED", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_replace");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  auto response = json::parse(R"({ "id": "srv-1", "name": "alice", "updatedAt": 100 })");

  SyncApplyGuard(conn).applyWithBypass([&] {
    applyReplace(applier, "customers", "temp-1", response);
  });

  REQUIRE(nameOf(*conn, "srv-1") == "alice");
  REQUIRE_FALSE(nameOf(*conn, "temp-1").has_value());

  auto meta = conn->execute(
    "SELECT entityId, remoteId, status FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = 'temp-1'", {});
  REQUIRE(meta.rows.size() == 1);
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "srv-1");
  REQUIRE(std::get<std::string>(meta.rows[0][1]) == "srv-1");
  REQUIRE(std::get<std::string>(meta.rows[0][2]) == "SYNCED");
}

TEST_CASE("applyReplace does not duplicate the metadata row or touch sync_queue", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_replace_no_duplication");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  auto queueBefore = conn->execute("SELECT COUNT(*) FROM sync_queue WHERE entity = 'customers'", {});

  auto response = json::parse(R"({ "id": "srv-1", "name": "alice", "updatedAt": 100 })");
  SyncApplyGuard(conn).applyWithBypass([&] { applyReplace(applier, "customers", "temp-1", response); });

  auto metaCount = conn->execute("SELECT COUNT(*) FROM _salve_sync_metadata WHERE tableName = 'customers'", {});
  REQUIRE(std::get<double>(metaCount.rows[0][0]) == 1.0);

  auto queueAfter = conn->execute("SELECT COUNT(*) FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(std::get<double>(queueAfter.rows[0][0]) == std::get<double>(queueBefore.rows[0][0]));
}

TEST_CASE("applyReplace rewrites pending sync_queue snapshots to the new entity id", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_replace_rewrites_queue");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  auto queueBefore = conn->execute("SELECT entity_id FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(std::get<std::string>(queueBefore.rows[0][0]) == "temp-1");

  auto response = json::parse(R"({ "id": "srv-1", "name": "alice", "updatedAt": 100 })");
  SyncApplyGuard(conn).applyWithBypass([&] { applyReplace(applier, "customers", "temp-1", response); });

  auto queueAfter = conn->execute("SELECT entity_id FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(std::get<std::string>(queueAfter.rows[0][0]) == "srv-1");
}

TEST_CASE("applyReplace cascades child FK rewrites via RelationCascadeRewriter", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_replace_cascade");
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
  auto response = json::parse(R"({ "id": "srv-1", "name": "alice", "updatedAt": 100 })");
  SyncApplyGuard(conn).applyWithBypass([&] { applyReplace(applier, "customers", "temp-1", response); });

  auto order = conn->execute("SELECT customerId FROM orders WHERE id = 'ord-1'", {});
  REQUIRE(std::get<std::string>(order.rows[0][0]) == "srv-1");
}

TEST_CASE("applyReplace ignores an unknown response column and still applies the known ones", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_replace_unknown_column");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  auto response = json::parse(R"({ "id": "srv-1", "name": "bob", "notAColumn": "x", "updatedAt": 100 })");

  REQUIRE_NOTHROW(
    SyncApplyGuard(conn).applyWithBypass([&] { applyReplace(applier, "customers", "temp-1", response); })
  );
  REQUIRE(nameOf(*conn, "srv-1") == "bob");
}

TEST_CASE("applyReplace rewrites the PK but preserves a newer concurrent local edit over a stale response (L4)", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_replace_concurrent_edit");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  // Response reflects the state of the row when the POST was sent.
  auto response = json::parse(R"({ "id": "srv-1", "name": "alice", "updatedAt": 100 })");

  // A local edit lands after the request body was built but before the
  // response is applied — simulates the race during the HTTP round-trip.
  conn->execute("UPDATE customers SET name = 'alice-v2', updatedAt = 200 WHERE id = 'temp-1'", {});

  SyncApplyGuard(conn).applyWithBypass([&] {
    applyReplace(applier, "customers", "temp-1", response);
  });

  REQUIRE_FALSE(nameOf(*conn, "temp-1").has_value());
  REQUIRE(nameOf(*conn, "srv-1") == "alice-v2");

  auto row = conn->execute("SELECT updatedAt FROM customers WHERE id = 'srv-1'", {});
  REQUIRE(std::get<double>(row.rows[0][0]) == 200.0);

  auto meta = conn->execute(
    "SELECT entityId, status FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = 'temp-1'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "srv-1");
  REQUIRE(std::get<std::string>(meta.rows[0][1]) == "SYNCED");
}

TEST_CASE("applyReplace with an empty response body keeps the current entityId and marks SYNCED", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_replace_empty_body");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  SyncApplyGuard(conn).applyWithBypass([&] {
    applyReplace(applier, "customers", "1", json::Value(nullptr));
  });

  auto meta = conn->execute("SELECT entityId, status FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = '1'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "1");
  REQUIRE(std::get<std::string>(meta.rows[0][1]) == "SYNCED");
}

TEST_CASE("applyReplace rejects a localId with no matching metadata", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_replace_orphan");
  SyncOperationApplier applier(conn);

  auto response = json::parse(R"({ "id": "srv-1", "updatedAt": 100 })");

  REQUIRE_THROWS_AS(
    SyncApplyGuard(conn).applyWithBypass([&] { applyReplace(applier, "customers", "ghost", response); }),
    std::runtime_error
  );
}

TEST_CASE("rewriteLocalRow failing does not revert recordRemoteSuccess's metadata write, even inside the same transaction", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_split_survives_row_failure");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  // Occupies the id the "server" is about to hand back. Inserted inside a bypass so it gets no
  // metadata row of its own — isolates this test to the domain-table PK collision (step 2's
  // failure), not the separate metadata-identity-collision case covered below.
  SyncApplyGuard(conn).applyWithBypass([&] {
    conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('srv-1', 'bob', 50)", {});
  });
  SyncOperationApplier applier(conn);

  auto response = json::parse(R"({ "id": "srv-1", "name": "alice", "updatedAt": 100 })");

  bool rewriteThrew = false;
  REQUIRE_NOTHROW(
    SyncApplyGuard(conn).applyWithBypass([&] {
      auto identity = applier.recordRemoteSuccess("customers", "temp-1", response);
      try {
        applier.rewriteLocalRow("customers", identity, response);
      } catch (const std::exception&) {
        rewriteThrew = true;
      }
    })
  );
  REQUIRE(rewriteThrew);

  auto meta = conn->execute(
    "SELECT entityId, remoteId, status FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = 'temp-1'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "srv-1");
  REQUIRE(std::get<std::string>(meta.rows[0][1]) == "srv-1");
  REQUIRE(std::get<std::string>(meta.rows[0][2]) == "SYNCED");

  // The domain row itself was never rewritten — still under its old id, now inconsistent with the metadata above.
  REQUIRE(nameOf(*conn, "temp-1") == "alice");
  REQUIRE(nameOf(*conn, "srv-1") == "bob");
}

TEST_CASE("recordRemoteSuccess throws cleanly when the resolved entityId is already claimed by a different local row", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_record_remote_success_identity_collision");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  // A different local row already owns entityId 'srv-1' in metadata (e.g. previously pulled from the server).
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('srv-1', 'bob', 50)", {});
  SyncOperationApplier applier(conn);

  auto response = json::parse(R"({ "id": "srv-1", "name": "alice", "updatedAt": 100 })");

  REQUIRE_THROWS(
    SyncApplyGuard(conn).applyWithBypass([&] {
      applier.recordRemoteSuccess("customers", "temp-1", response);
    })
  );

  auto tempMeta = conn->execute(
    "SELECT entityId, status FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = 'temp-1'", {});
  REQUIRE(std::get<std::string>(tempMeta.rows[0][0]) == "temp-1");
  REQUIRE(std::get<std::string>(tempMeta.rows[0][1]) == "PENDING");

  auto srvMeta = conn->execute(
    "SELECT entityId, status FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = 'srv-1'", {});
  REQUIRE(std::get<std::string>(srvMeta.rows[0][0]) == "srv-1");
  REQUIRE(std::get<std::string>(srvMeta.rows[0][1]) == "PENDING");
}

TEST_CASE("confirmDeleted stamps syncedAt and keeps status DELETED", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_confirm_deleted");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'alice', 100)", {});
  conn->execute("DELETE FROM customers WHERE id = '1'", {});
  SyncOperationApplier applier(conn);

  REQUIRE_NOTHROW(SyncApplyGuard(conn).applyWithBypass([&] { applier.confirmDeleted("customers", "1"); }));

  auto meta = conn->execute(
    "SELECT status, syncedAt FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = '1'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "DELETED");
  REQUIRE(std::get<double>(meta.rows[0][1]) != 0.0);
}

TEST_CASE("a real edit after replace updates the same frozen localId row instead of duplicating it", "[sync][SyncOperationApplier]") {
  auto conn = openWithCustomers("applier_replace_post_edit");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  SyncOperationApplier applier(conn);

  auto response = json::parse(R"({ "id": "srv-1", "name": "alice", "updatedAt": 100 })");
  SyncApplyGuard(conn).applyWithBypass([&] { applyReplace(applier, "customers", "temp-1", response); });

  // Real edit, outside the bypass — fires the update trigger normally.
  conn->execute("UPDATE customers SET name = 'alice-v2', updatedAt = 200 WHERE id = 'srv-1'", {});

  auto count = conn->execute("SELECT COUNT(*) FROM _salve_sync_metadata WHERE tableName = 'customers'", {});
  REQUIRE(std::get<double>(count.rows[0][0]) == 1.0);

  auto meta = conn->execute("SELECT localId, status FROM _salve_sync_metadata WHERE tableName = 'customers'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "temp-1");
  REQUIRE(std::get<std::string>(meta.rows[0][1]) == "PENDING");
}
