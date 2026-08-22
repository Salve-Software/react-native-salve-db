#include <catch2/catch_test_macros.hpp>
#include "../../database/DatabaseManager.hpp"
#include "../../database/DatabaseResetter.hpp"
#include "../../database/MigrationEngine.hpp"
#include <algorithm>
#include <vector>

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

// One plain schema, one sync-enabled — proves table discovery isn't limited to sync.enabled schemas.
std::shared_ptr<SQLiteConnection> openResetterFixture(const std::string& testName) {
  DatabaseManager::shared().open(uniqueDbName(testName));
  auto conn = DatabaseManager::shared().connection();

  MigrationEngine engine(conn);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" } }
  })"));
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": {
      "enabled": true,
      "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}" },
      "pagination": { "pageSize": 20, "maxPagesPerSession": 20 }
    }
  })"));

  return conn;
}

int rowCount(SQLiteConnection& conn, const std::string& table) {
  auto rows = conn.execute("SELECT COUNT(*) FROM \"" + table + "\"", {});
  return static_cast<int>(std::get<double>(rows.rows[0][0]));
}

} // namespace

TEST_CASE("DatabaseResetter::reset() wipes every domain table, regardless of sync.enabled", "[database][DatabaseResetter]") {
  auto conn = openResetterFixture("resetter_multi_schema");
  conn->execute("INSERT INTO widgets (id) VALUES (?)", {1.0});
  conn->execute("INSERT INTO customers (id, updatedAt) VALUES (?, ?)", {std::string("c1"), 100.0});
  REQUIRE(rowCount(*conn, "widgets") == 1);
  REQUIRE(rowCount(*conn, "customers") == 1);

  DatabaseResetter::reset();

  REQUIRE(rowCount(*conn, "widgets") == 0);
  REQUIRE(rowCount(*conn, "customers") == 0);
}

TEST_CASE("DatabaseResetter::reset() fires exactly one coalesced notification listing only the wiped domain tables", "[database][DatabaseResetter][notify]") {
  auto conn = openResetterFixture("resetter_notify");
  conn->execute("INSERT INTO widgets (id) VALUES (?)", {1.0});
  conn->execute("INSERT INTO customers (id, updatedAt) VALUES (?, ?)", {std::string("c1"), 100.0});

  std::vector<std::vector<std::string>> received;
  int subId = conn->subscribe([&](std::vector<std::string> tables) { received.push_back(std::move(tables)); });

  DatabaseResetter::reset();

  conn->unsubscribe(subId);

  REQUIRE(received.size() == 1); // one transaction, one coalesced notification

  auto tables = received[0];
  std::sort(tables.begin(), tables.end());
  // _sync_apply_lock shows up too: SyncApplyGuard's INSERT into it isn't subject to the truncate optimization that hides internal tables' DELETEs.
  REQUIRE(tables == std::vector<std::string>{"_sync_apply_lock", "customers", "widgets"});
}

TEST_CASE("DatabaseResetter::reset() leaves no stray row behind in _sync_apply_lock", "[database][DatabaseResetter]") {
  auto conn = openResetterFixture("resetter_apply_lock");
  conn->execute("INSERT INTO widgets (id) VALUES (?)", {1.0});

  DatabaseResetter::reset();

  REQUIRE(rowCount(*conn, "_sync_apply_lock") == 0);
}

TEST_CASE("DatabaseResetter::reset() is a no-op that doesn't throw when the database was never opened", "[database][DatabaseResetter]") {
  DatabaseManager::shared().closeForTesting();

  REQUIRE_NOTHROW(DatabaseResetter::reset());
  REQUIRE_FALSE(DatabaseManager::shared().isOpen());
}
