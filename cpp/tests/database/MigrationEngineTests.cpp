#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include <memory>

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

  REQUIRE(columnsOf(*conn, "widgets") == std::vector<std::string>{"id", "label", "sku", "status"});
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

  REQUIRE(columnsOf(*conn, "widgets") == std::vector<std::string>{"id", "label", "price"});
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

  REQUIRE(columnsOf(*conn, "widgets") == std::vector<std::string>{"id", "label", "legacyNote"});
  auto row = conn->execute("SELECT legacyNote FROM widgets WHERE id = 1", {});
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "keep-me");
  REQUIRE(storedVersion(*conn, "widgets") == 2);
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

  // ALTER-added columns append in schema-map (alphabetical) order after the
  // original CREATE TABLE columns — the physical layout isn't re-sorted.
  REQUIRE(columnsOf(*conn, "widgets") == std::vector<std::string>{"id", "label", "active", "price"});
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

int triggerCount(SQLiteConnection& conn, const std::string& tableName) {
  auto r = conn.execute("SELECT COUNT(*) FROM sqlite_master WHERE type = 'trigger' AND tbl_name = ?", { tableName });
  return static_cast<int>(std::get<double>(r.rows[0][0]));
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
    "columns": { "id": { "type": "integer" }, "name": { "type": "text" }, "phone": { "type": "text" }, "updatedAt": { "type": "datetime" } },
    "sync": { "enabled": true }
  })"));

  REQUIRE(triggerCount(*conn, "customers") == 3);

  auto insertSql = triggerSql(*conn, "customers_sync_after_insert");
  REQUIRE(insertSql.find("json_object('id', NEW.\"id\", 'name', NEW.\"name\", 'phone', NEW.\"phone\", 'updatedAt', NEW.\"updatedAt\")") != std::string::npos);

  auto updateSql = triggerSql(*conn, "customers_sync_after_update");
  REQUIRE(updateSql.find("json_object('id', NEW.\"id\", 'name', NEW.\"name\", 'phone', NEW.\"phone\", 'updatedAt', NEW.\"updatedAt\")") != std::string::npos);

  auto deleteSql = triggerSql(*conn, "customers_sync_after_delete");
  REQUIRE(deleteSql.find("json_object('id', OLD.\"id\")") != std::string::npos);
  REQUIRE(deleteSql.find("'name'") == std::string::npos); // delete payload is PK-only
}

TEST_CASE("sync.enabled: false or absent creates no triggers", "[migration][sync]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("sync_disabled"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "no_sync_field", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" } }
  })"));
  REQUIRE(triggerCount(*conn, "no_sync_field") == 0);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "sync_off", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" } },
    "sync": { "enabled": false }
  })"));
  REQUIRE(triggerCount(*conn, "sync_off") == 0);
}

TEST_CASE("migrating a sync-enabled schema with a new column regenerates triggers", "[migration][sync]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("sync_migrate_regen"));
  MigrationEngine engine(conn);

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "name": { "type": "text" }, "updatedAt": { "type": "datetime" } },
    "sync": { "enabled": true }
  })"));

  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 2, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "name": { "type": "text" }, "phone": { "type": "text" }, "updatedAt": { "type": "datetime" } },
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
    "columns": { "id": { "type": "integer" }, "updatedAt": { "type": "datetime" } },
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

  CHECK_NOTHROW(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "updatedAt": { "type": "datetime" } },
    "sync": { "enabled": true }
  })"));
}
