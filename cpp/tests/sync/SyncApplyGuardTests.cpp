#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/SyncApplyGuard.hpp"
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
    "sync": { "enabled": true }
  })"));
}

} // namespace

TEST_CASE("direct writes outside any apply lock enqueue sync_queue entries", "[sync][SyncApplyGuard]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("direct_writes"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);

  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'a', 100)", {});
  conn->execute("UPDATE customers SET name = 'b' WHERE id = 1", {});
  conn->execute("DELETE FROM customers WHERE id = 1", {});

  auto rows = conn->execute("SELECT operation FROM sync_queue WHERE entity = 'customers' ORDER BY id", {});
  REQUIRE(rows.rows.size() == 3);
  REQUIRE(std::get<std::string>(rows.rows[0][0]) == "insert");
  REQUIRE(std::get<std::string>(rows.rows[1][0]) == "update");
  REQUIRE(std::get<std::string>(rows.rows[2][0]) == "delete");
}

TEST_CASE("writes performed inside applyWithBypass are not queued", "[sync][SyncApplyGuard]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("bypass_writes"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);

  SyncApplyGuard guard(conn);
  guard.applyWithBypass([&]() {
    conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'from-server', 100)", {});
    conn->execute("UPDATE customers SET name = 'still-from-server' WHERE id = 1", {});
  });

  auto rows = conn->execute("SELECT COUNT(*) FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 0.0);

  auto data = conn->execute("SELECT name FROM customers WHERE id = 1", {});
  REQUIRE(std::get<std::string>(data.rows[0][0]) == "still-from-server");
}

TEST_CASE("a failed apply rolls back the lock, and normal writes resume being tracked", "[sync][SyncApplyGuard]") {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath("bypass_rollback"));
  MigrationEngine engine(conn);
  registerSyncEnabledCustomers(engine);

  SyncApplyGuard guard(conn);
  CHECK_THROWS(guard.applyWithBypass([&]() {
    conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (1, 'partial', 100)", {});
    conn->execute("INSERT INTO no_such_table (id) VALUES (1)", {}); // forces failure mid-apply
  }));

  auto customerRows = conn->execute("SELECT COUNT(*) FROM customers", {});
  REQUIRE(std::get<double>(customerRows.rows[0][0]) == 0.0);
  auto lockRows = conn->execute("SELECT COUNT(*) FROM _sync_apply_lock", {});
  REQUIRE(std::get<double>(lockRows.rows[0][0]) == 0.0);

  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (2, 'normal-write', 100)", {});
  auto queued = conn->execute("SELECT COUNT(*) FROM sync_queue WHERE entity_id = '2'", {});
  REQUIRE(std::get<double>(queued.rows[0][0]) == 1.0);
}
