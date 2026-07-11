#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../database/platform.hpp"
#include <memory>

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbPath(const std::string& testName) {
  static int counter = 0;
  return getPlatformDocumentsDirectory() + "/" + testName + "_" + std::to_string(++counter) + ".db";
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
