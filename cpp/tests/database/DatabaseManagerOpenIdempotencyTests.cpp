#include <catch2/catch_test_macros.hpp>
#include "../../database/DatabaseManager.hpp"
#include "../../database/MigrationEngine.hpp"

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

std::string journalMode(SQLiteConnection& conn) {
  auto result = conn.execute("PRAGMA journal_mode", {});
  return std::get<std::string>(result.rows[0][0]);
}

} // namespace

TEST_CASE("open() with the same name and walMode reuses the existing connection", "[database][DatabaseManager][open]") {
  auto name = uniqueDbName("idempotent_same");
  DatabaseManager::shared().open(name);
  auto before = DatabaseManager::shared().connection();

  DatabaseManager::shared().open(name);

  REQUIRE(DatabaseManager::shared().connection() == before);
}

TEST_CASE("open() with a different walMode for the same name recreates the connection", "[database][DatabaseManager][open]") {
  auto name = uniqueDbName("idempotent_walmode");
  DatabaseManager::shared().open(name, true);
  auto* beforeRaw = DatabaseManager::shared().connection().get();
  REQUIRE(journalMode(*DatabaseManager::shared().connection()) == "wal");

  // journal_mode=DELETE needs exclusive access — don't hold our own reference to the WAL
  // connection while opening the replacement, on top of whatever DatabaseManager itself holds.
  DatabaseManager::shared().open(name, false);

  REQUIRE(DatabaseManager::shared().connection().get() != beforeRaw);
  REQUIRE(journalMode(*DatabaseManager::shared().connection()) == "delete");
}

TEST_CASE("open() with a different name recreates the connection", "[database][DatabaseManager][open]") {
  DatabaseManager::shared().open(uniqueDbName("idempotent_name_a"));
  auto before = DatabaseManager::shared().connection();

  DatabaseManager::shared().open(uniqueDbName("idempotent_name_b"));

  REQUIRE(DatabaseManager::shared().connection() != before);
}

TEST_CASE("open() reusing the connection preserves SchemaRegistry — boolean coercion survives a repeat configure()", "[database][DatabaseManager][open][SchemaRegistry]") {
  auto name = uniqueDbName("idempotent_schema_registry");
  DatabaseManager::shared().open(name);
  auto conn = DatabaseManager::shared().connection();

  MigrationEngine engine(conn);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "flags", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "active": { "type": "boolean" } }
  })"));
  conn->execute("INSERT INTO flags (id, active) VALUES (?, ?)", {1.0, true});

  // Simulates a repeat Database.configure() with the same name — no reset() in between.
  DatabaseManager::shared().open(name);

  auto result = DatabaseManager::shared().connection()->execute("SELECT active FROM flags WHERE id = ?", {1.0});
  REQUIRE(std::holds_alternative<bool>(result.rows[0][0]));
  REQUIRE(std::get<bool>(result.rows[0][0]) == true);
}
