#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include <memory>
#include <string>
#include <vector>

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbPath(const std::string& testName) {
  static int counter = 0;
  return platform::getDocumentsDirectory() + "/" + testName + "_" + std::to_string(++counter) + ".db";
}

int storedVersion(SQLiteConnection& conn, const std::string& name) {
  auto result = conn.execute("SELECT version FROM _salve_schema_versions WHERE name = ?", { name });
  if (result.rows.empty()) return 0;
  return static_cast<int>(std::get<double>(result.rows[0][0]));
}

std::vector<std::string> columnsOf(SQLiteConnection& conn, const std::string& table) {
  auto result = conn.execute("PRAGMA table_info(\"" + table + "\")", {});
  std::vector<std::string> cols;
  for (auto& row : result.rows) cols.push_back(std::get<std::string>(row[1]));
  return cols;
}

bool indexExists(SQLiteConnection& conn, const std::string& indexName) {
  auto result = conn.execute("SELECT name FROM sqlite_master WHERE type = 'index' AND name = ?", { indexName });
  return !result.rows.empty();
}

} // namespace

TEST_CASE("registerSchema creates table and indexes from a new schema", "[migration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("create"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": {
      "id": { "type": "integer" },
      "label": { "type": "text", "nullable": false },
      "sku": { "type": "text", "unique": true },
      "status": { "type": "text", "default": "pending" }
    },
    "indexes": [{ "name": "idx_widgets_label", "columns": ["label"] }]
  })"));

  REQUIRE(columnsOf(*conn, "widgets") == std::vector<std::string>{"id", "label", "sku", "status", "deletedAt"});
  REQUIRE(indexExists(*conn, "idx_widgets_label"));

  conn->execute("INSERT INTO widgets (id, label, sku) VALUES (1, 'a', 'sku-1')", {});
  CHECK_THROWS(conn->execute("INSERT INTO widgets (id, label, sku) VALUES (2, 'b', 'sku-1')", {})); // unique
  CHECK_THROWS(conn->execute("INSERT INTO widgets (id, label, sku) VALUES (3, NULL, 'sku-3')", {})); // not null

  auto defaulted = conn->execute("SELECT status FROM widgets WHERE id = 1", {});
  REQUIRE(std::get<std::string>(defaulted.rows[0][0]) == "pending");

  REQUIRE(storedVersion(*conn, "widgets") == 1);
}

TEST_CASE("registerSchema is idempotent when version is unchanged", "[migration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("idempotent"));
  MigrationEngine engine(conn);
  std::string schemaJson = R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "label": { "type": "text" } }
  })";

  engine.registerSchema(MigrationEngine::parseSchemaJson(schemaJson));
  conn->execute("INSERT INTO widgets (id, label) VALUES (1, 'a')", {});
  engine.registerSchema(MigrationEngine::parseSchemaJson(schemaJson));

  auto rows = conn->execute("SELECT COUNT(*) FROM widgets", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 1.0);
  REQUIRE(storedVersion(*conn, "widgets") == 1);
}

TEST_CASE("version bump with a new column applies ADD COLUMN and preserves data", "[migration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("addcol"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "label": { "type": "text" } }
  })"));
  conn->execute("INSERT INTO widgets (id, label) VALUES (1, 'a')", {});

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 2, "primaryKey": "id",
    "columns": {
      "id": { "type": "integer" }, "label": { "type": "text" }, "price": { "type": "real" }
    }
  })"));

  REQUIRE(columnsOf(*conn, "widgets") == std::vector<std::string>{"id", "label", "deletedAt", "price"});
  auto row = conn->execute("SELECT label, price FROM widgets WHERE id = 1", {});
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "a");
  REQUIRE(storedVersion(*conn, "widgets") == 2);
}

TEST_CASE("ADD COLUMN with a declared default backfills existing rows on a non-empty table", "[migration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("addcol_default"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "label": { "type": "text" } }
  })"));
  conn->execute("INSERT INTO widgets (id, label) VALUES (1, 'a')", {});

  // SQLite rejects ADD COLUMN ... NOT NULL on a non-empty table unless the
  // ALTER statement itself carries a literal DEFAULT — this must not throw,
  // and the declared default (42), not a synthetic placeholder, must land.
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 2, "primaryKey": "id",
    "columns": {
      "id": { "type": "integer" }, "label": { "type": "text" },
      "priority": { "type": "integer", "nullable": false, "default": 42 }
    }
  })"));

  auto existingRow = conn->execute("SELECT priority FROM widgets WHERE id = 1", {});
  REQUIRE(std::get<double>(existingRow.rows[0][0]) == 42.0);

  conn->execute("INSERT INTO widgets (id, label) VALUES (2, 'b')", {});
  auto newRow = conn->execute("SELECT priority FROM widgets WHERE id = 2", {});
  REQUIRE(std::get<double>(newRow.rows[0][0]) == 42.0);
}

TEST_CASE("ADD COLUMN respects unique: true", "[migration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("addcol_unique"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" } }
  })"));
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 2, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "email": { "type": "text", "unique": true } }
  })"));

  conn->execute("INSERT INTO widgets (id, email) VALUES (1, 'a@a.com')", {});
  CHECK_THROWS(conn->execute("INSERT INTO widgets (id, email) VALUES (2, 'a@a.com')", {}));
}

TEST_CASE("removing a column from the schema leaves it orphaned with data intact", "[migration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("dropcol"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": {
      "id": { "type": "integer" }, "label": { "type": "text" }, "legacyNote": { "type": "text" }
    }
  })"));
  conn->execute("INSERT INTO widgets (id, label, legacyNote) VALUES (1, 'a', 'keep-me')", {});

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 2, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "label": { "type": "text" } }
  })"));

  REQUIRE(columnsOf(*conn, "widgets") == std::vector<std::string>{"id", "label", "legacyNote", "deletedAt"});
  auto row = conn->execute("SELECT legacyNote FROM widgets WHERE id = 1", {});
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "keep-me");
  REQUIRE(storedVersion(*conn, "widgets") == 2);
}

TEST_CASE("registerSchema recreates a table dropped externally, even though _salve_schema_versions still has a stored version", "[migration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("recreate_after_external_drop"));
  MigrationEngine engine(conn);
  std::string schemaJson = R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "label": { "type": "text" } }
  })";

  engine.registerSchema(MigrationEngine::parseSchemaJson(schemaJson));
  conn->execute("INSERT INTO widgets (id, label) VALUES (1, 'a')", {});

  // Simulates the Studio's "delete table" action: DROP TABLE without touching
  // _salve_schema_versions.
  conn->exec("DROP TABLE widgets");
  REQUIRE(storedVersion(*conn, "widgets") == 1); // still stale

  // Must not throw (previously fell through to ALTER TABLE on a table that
  // no longer existed) and must fully recreate the table.
  REQUIRE_NOTHROW(engine.registerSchema(MigrationEngine::parseSchemaJson(schemaJson)));

  REQUIRE(columnsOf(*conn, "widgets") == std::vector<std::string>{"id", "label", "deletedAt"});
  auto rows = conn->execute("SELECT COUNT(*) FROM widgets", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 0.0); // fresh table, old row is gone
  REQUIRE(storedVersion(*conn, "widgets") == 1);

  conn->execute("INSERT INTO widgets (id, label) VALUES (2, 'b')", {});
  auto row = conn->execute("SELECT label FROM widgets WHERE id = 2", {});
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "b");
}

TEST_CASE("opening at version N with a schema at N+2 applies all pending columns at once", "[migration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("multijump"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "label": { "type": "text" } }
  })"));
  conn->execute("INSERT INTO widgets (id, label) VALUES (1, 'a')", {});

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 3, "primaryKey": "id",
    "columns": {
      "id": { "type": "integer" }, "label": { "type": "text" },
      "price": { "type": "real" }, "active": { "type": "boolean" }
    }
  })"));

  // ALTER-added columns append after the original CREATE TABLE columns, in the
  // order they're declared in the schema — the physical layout isn't re-sorted.
  REQUIRE(columnsOf(*conn, "widgets") == std::vector<std::string>{"id", "label", "deletedAt", "price", "active"});
  auto row = conn->execute("SELECT label FROM widgets WHERE id = 1", {});
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "a");
  REQUIRE(storedVersion(*conn, "widgets") == 3);
}

TEST_CASE("a failure mid-registration rolls back the whole migration", "[migration]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("rollback"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "existing", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" } }
  })"));

  // Index name collides with the already-registered "existing" table — SQLite
  // errors on the type mismatch even with IF NOT EXISTS, unlike a merely
  // nonexistent column (which SQLite silently accepts under IF NOT EXISTS).
  CHECK_THROWS(engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" } },
    "indexes": [{ "name": "existing", "columns": ["id"] }]
  })")));

  CHECK_THROWS(conn->execute("SELECT * FROM widgets", {}));
  REQUIRE(storedVersion(*conn, "widgets") == 0);
  REQUIRE(storedVersion(*conn, "existing") == 1); // unrelated, already-committed schema is untouched
}

namespace {

bool tableExists(SQLiteConnection& conn, const std::string& name) {
  auto r = conn.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?", { name });
  return !r.rows.empty();
}

// Counts only the sync-queue triggers (name-prefixed "<table>_sync_..."),
// excluding the always-on "<table>_change_notify_delete" trigger (#63) so
// existing sync-trigger assertions don't need to know about it.
int triggerCount(SQLiteConnection& conn, const std::string& tableName) {
  auto r = conn.execute(
    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ? AND name LIKE ?",
    { tableName, tableName + "_sync_%" });
  return static_cast<int>(std::get<double>(r.rows[0][0]));
}

bool changeNotifyTriggerExists(SQLiteConnection& conn, const std::string& tableName) {
  auto r = conn.execute(
    "SELECT 1 FROM sqlite_master WHERE type = 'trigger' AND name = ?",
    { tableName + "_change_notify_delete" });
  return !r.rows.empty();
}

std::string triggerSql(SQLiteConnection& conn, const std::string& name) {
  auto r = conn.execute("SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?", { name });
  REQUIRE(!r.rows.empty());
  return std::get<std::string>(r.rows[0][0]);
}

} // namespace

TEST_CASE("sync_queue and _sync_apply_lock are created once and survive repeated registerSchema", "[migration][sync]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("sync_tables_once"));
  MigrationEngine engine(conn);
  std::string schemaJson = R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" } }
  })";

  engine.registerSchema(MigrationEngine::parseSchemaJson(schemaJson));
  REQUIRE(tableExists(*conn, "sync_queue"));
  REQUIRE(tableExists(*conn, "_sync_apply_lock"));

  conn->execute(
    "INSERT INTO sync_queue (operation, entity, entity_id, payload, updated_at) VALUES ('insert','widgets','1','{}',0)", {});
  engine.registerSchema(MigrationEngine::parseSchemaJson(schemaJson));

  auto rows = conn->execute("SELECT COUNT(*) FROM sync_queue", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 1.0);
}

TEST_CASE("sync.enabled: true creates 3 triggers matching schema.columns", "[migration][sync]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("sync_triggers"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "name": { "type": "text" }, "phone": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": { "enabled": true }
  })"));

  REQUIRE(triggerCount(*conn, "customers") == 3);

  auto insertSql = triggerSql(*conn, "customers_sync_after_insert");
  REQUIRE(insertSql.find("json_object('id', NEW.\"id\", 'name', NEW.\"name\", 'phone', NEW.\"phone\", 'updatedAt', NEW.\"updatedAt\", 'deletedAt', NEW.\"deletedAt\")") != std::string::npos);

  auto updateSql = triggerSql(*conn, "customers_sync_after_update");
  REQUIRE(updateSql.find("json_object('id', NEW.\"id\", 'name', NEW.\"name\", 'phone', NEW.\"phone\", 'updatedAt', NEW.\"updatedAt\", 'deletedAt', NEW.\"deletedAt\")") != std::string::npos);

  auto deleteSql = triggerSql(*conn, "customers_sync_after_delete");
  REQUIRE(deleteSql.find("json_object('id', OLD.\"id\")") != std::string::npos);
  REQUIRE(deleteSql.find("'name'") == std::string::npos); // delete payload is PK-only
}

TEST_CASE("sync.enabled: false or absent creates no sync triggers, but keeps the change-notification trigger", "[migration][sync]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("sync_disabled"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "no_sync_field", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" } }
  })"));
  REQUIRE(triggerCount(*conn, "no_sync_field") == 0);
  REQUIRE(changeNotifyTriggerExists(*conn, "no_sync_field"));

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "sync_off", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" } },
    "sync": { "enabled": false }
  })"));
  REQUIRE(triggerCount(*conn, "sync_off") == 0);
  REQUIRE(changeNotifyTriggerExists(*conn, "sync_off"));
}

TEST_CASE("enabling sync.enabled with no column change still creates triggers", "[migration][sync]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("sync_enable_no_version_bump"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "name": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } }
  })"));
  REQUIRE(triggerCount(*conn, "customers") == 0);

  // Version bump when enabling sync to add the status column.
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 2, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "name": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": { "enabled": true }
  })"));

  REQUIRE(triggerCount(*conn, "customers") == 3);

  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});
  auto rows = conn->execute("SELECT COUNT(*) FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 1.0);
}

TEST_CASE("migrating a sync-enabled schema with a new column regenerates triggers", "[migration][sync]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("sync_migrate_regen"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "name": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": { "enabled": true }
  })"));

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 2, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "name": { "type": "text" }, "phone": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": { "enabled": true }
  })"));

  REQUIRE(triggerCount(*conn, "customers") == 3);
  auto insertSql = triggerSql(*conn, "customers_sync_after_insert");
  REQUIRE(insertSql.find("'phone', NEW.\"phone\"") != std::string::npos);
}

TEST_CASE("turning sync.enabled off across versions drops orphaned triggers", "[migration][sync]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("sync_toggle_off"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": { "enabled": true }
  })"));
  REQUIRE(triggerCount(*conn, "customers") == 3);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 2, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "note": { "type": "text" } },
    "sync": { "enabled": false }
  })"));
  REQUIRE(triggerCount(*conn, "customers") == 0);
}

TEST_CASE("sync.enabled: true without a datetime 'updatedAt' column throws", "[migration][sync]") {
  CHECK_THROWS_AS(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "name": { "type": "text" } },
    "sync": { "enabled": true }
  })"), std::runtime_error);

  CHECK_THROWS_AS(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "updatedAt": { "type": "integer" } },
    "sync": { "enabled": true }
  })"), std::runtime_error);

  // datetime type but nullable (default), no explicit "nullable": false
  CHECK_THROWS_AS(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "updatedAt": { "type": "datetime" } },
    "sync": { "enabled": true }
  })"), std::runtime_error);

  CHECK_NOTHROW(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": { "enabled": true }
  })"));
}

TEST_CASE("a bare DELETE FROM with no WHERE on a schema without sync still notifies subscribers (#63)", "[migration][notify]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("bare_delete_no_sync"));
  MigrationEngine engine(conn);

  // No "sync" field at all — the case from the issue repro.
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "items", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "title": { "type": "text" } }
  })"));

  conn->execute("INSERT INTO items (id, title) VALUES (1, 'a')", {});
  conn->execute("INSERT INTO items (id, title) VALUES (2, 'b')", {});

  std::vector<std::vector<std::string>> received;
  conn->subscribe([&](std::vector<std::string> tables) { received.push_back(tables); });

  // Without the always-on change-notification trigger, SQLite's truncate
  // optimization would skip sqlite3_update_hook entirely for this statement.
  conn->execute("DELETE FROM items", {});

  auto countRows = conn->execute("SELECT COUNT(*) FROM items", {});
  REQUIRE(std::get<double>(countRows.rows[0][0]) == 0.0);

  REQUIRE(received.size() == 1);
  REQUIRE(received[0] == std::vector<std::string>{"items"});
}
