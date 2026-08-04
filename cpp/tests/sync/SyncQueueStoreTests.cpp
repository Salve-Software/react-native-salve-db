#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/SyncApplyGuard.hpp"
#include "../../sync/SyncQueueStore.hpp"
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
    "columns": { "id": { "type": "integer" }, "name": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": { "enabled": true, "endpoint": { "basePath": "/customers", "listQueryTemplate": "since={since}&limit={limit}" } }
  })"));
}

} // namespace

TEST_CASE("readPending serializes sync_queue rows to SyncQueueItem, enriched with localId", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_shape"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});

  SyncQueueStore store(conn);
  auto items = store.readPending("customers", 10);

  REQUIRE(items.size() == 1);
  REQUIRE(items[0].operation == "insert");
  REQUIRE(items[0].queuedEntityId == "1");
  REQUIRE(items[0].localId.has_value());
  REQUIRE(*items[0].localId == "1");
}

TEST_CASE("readPending respects the limit and returns oldest-first", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_limit"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (2, 'b', 100)", {});
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (3, 'c', 100)", {});

  SyncQueueStore store(conn);
  auto items = store.readPending("customers", 2);

  REQUIRE(items.size() == 2);
  REQUIRE(items[0].queuedEntityId == "1");
  REQUIRE(items[1].queuedEntityId == "2");
}

TEST_CASE("readPending does not mutate sync_queue", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_readonly"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});

  SyncQueueStore store(conn);
  store.readPending("customers", 10);

  auto rows = conn->execute("SELECT COUNT(*) FROM sync_queue", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 1.0);
}

TEST_CASE("readPending rejects a negative limit", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_negative_limit"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});

  SyncQueueStore store(conn);
  REQUIRE_THROWS_AS(store.readPending("customers", -1), std::runtime_error);
}

TEST_CASE("readPending with limit 0 returns an empty array", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_zero_limit"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});

  SyncQueueStore store(conn);
  REQUIRE(store.readPending("customers", 0).empty());
}

TEST_CASE("readPending filters by entity", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_entity_filter"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": { "enabled": true, "endpoint": { "basePath": "/orders", "listQueryTemplate": "since={since}&limit={limit}" } }
  })"));
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});
  conn->execute("INSERT INTO orders (id, updatedAt) VALUES (100, 100)", {});

  SyncQueueStore store(conn);
  auto items = store.readPending("customers", 10);

  REQUIRE(items.size() == 1);
  REQUIRE(items[0].queuedEntityId == "1");
}

TEST_CASE("readPending on an empty queue returns an empty array", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_empty"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);

  SyncQueueStore store(conn);
  REQUIRE(store.readPending("customers", 10).empty());
}

TEST_CASE("readPending resolves the frozen localId via entityId after a replace", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_post_replace"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});
  conn->execute("DELETE FROM sync_queue WHERE entity = 'customers'", {});

  // Simulate a completed replace: PK rewritten to the server id inside the
  // bypass (as applyReplace does), entityId follows while localId stays frozen.
  SyncApplyGuard(conn).applyWithBypass([&] {
    conn->execute("UPDATE customers SET id = 2 WHERE id = 1", {});
    conn->execute(
      "UPDATE _salve_sync_metadata SET entityId = '2', remoteId = '2', status = 'SYNCED'"
      " WHERE tableName = 'customers' AND localId = '1'", {});
  });

  conn->execute("UPDATE customers SET name = 'b', updatedAt = 200 WHERE id = 2", {});

  SyncQueueStore store(conn);
  auto items = store.readPending("customers", 10);

  REQUIRE(items.size() == 1);
  REQUIRE(items[0].queuedEntityId == "2");
  REQUIRE(items[0].localId.has_value());
  REQUIRE(*items[0].localId == "1");
}

TEST_CASE("readPending includes FAILED items alongside PENDING", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_includes_failed"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});

  SyncQueueStore store(conn);
  auto before = store.readPending("customers", 10);
  store.markFailed(before[0].id, "HTTP 400");

  auto after = store.readPending("customers", 10);
  REQUIRE(after.size() == 1);
}

TEST_CASE("markFailed increments retryCount and sets lastError", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_mark_failed"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});

  SyncQueueStore store(conn);
  auto items = store.readPending("customers", 10);
  store.markFailed(items[0].id, "HTTP 400");
  store.markFailed(items[0].id, "HTTP 400");

  auto row = conn->execute("SELECT status, retryCount, lastError FROM sync_queue WHERE id = ?", { static_cast<double>(items[0].id) });
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "FAILED");
  REQUIRE(std::get<double>(row.rows[0][1]) == 2.0);
  REQUIRE(std::get<std::string>(row.rows[0][2]) == "HTTP 400");
}

TEST_CASE("markBlocked excludes the item from readPending but keeps it in the queue", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_mark_blocked"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});

  SyncQueueStore store(conn);
  auto items = store.readPending("customers", 10);
  store.markBlocked(items[0].id, "HTTP 404 — target no longer exists on the server");

  REQUIRE(store.readPending("customers", 10).empty());

  auto row = conn->execute("SELECT status, retryCount, lastError FROM sync_queue WHERE id = ?", { static_cast<double>(items[0].id) });
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "BLOCKED");
  REQUIRE(std::get<double>(row.rows[0][1]) == 1.0);
  REQUIRE(std::get<std::string>(row.rows[0][2]) == "HTTP 404 — target no longer exists on the server");
}

TEST_CASE("a blocked item can still be removed directly", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_remove_blocked"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});

  SyncQueueStore store(conn);
  auto items = store.readPending("customers", 10);
  store.markBlocked(items[0].id, "blocked");
  store.remove(items[0].id);

  auto rows = conn->execute("SELECT COUNT(*) FROM sync_queue", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 0.0);
}

TEST_CASE("remove deletes only the given item", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_remove"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (2, 'b', 100)", {});

  SyncQueueStore store(conn);
  auto items = store.readPending("customers", 10);
  store.remove(items[0].id);

  auto remaining = store.readPending("customers", 10);
  REQUIRE(remaining.size() == 1);
  REQUIRE(remaining[0].queuedEntityId == "2");
}

TEST_CASE("rewriteEntityId updates pending snapshots and never touches another entity", "[sync][SyncQueueStore]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("store_rewrite_entity_id"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": { "enabled": true, "endpoint": { "basePath": "/orders", "listQueryTemplate": "since={since}&limit={limit}" } }
  })"));
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});
  conn->execute("INSERT INTO orders (id, updatedAt) VALUES ('1', 100)", {});

  SyncQueueStore store(conn);
  store.rewriteEntityId("customers", "1", "srv-1");

  auto customerItems = store.readPending("customers", 10);
  REQUIRE(customerItems[0].queuedEntityId == "srv-1");

  auto orderItems = store.readPending("orders", 10);
  REQUIRE(orderItems[0].queuedEntityId == "1");
}
