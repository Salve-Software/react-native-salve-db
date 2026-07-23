#include <catch2/catch_test_macros.hpp>
#include "../support/HybridDatabaseHarness.hpp"

using margelo::nitro::salvedb::tests::HybridDatabaseHarness;

namespace {

// Every test needs its own unique db name — DatabaseManager is a process-wide
// singleton, and each configure() call points it at a new file under the
// same test-only temp directory (see platform_test.cpp).
std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

std::string configureExpr(const std::string& name) {
  return "db.configure({ name: '" + name + "' })";
}

} // namespace

TEST_CASE("execute() runs a simple SELECT", "[query]") {
  HybridDatabaseHarness harness;
  auto db = "globalThis.NitroModulesProxy.createHybridObject('SalveDatabase')";
  harness.run("(() => { globalThis.db = " + std::string(db) + "; return true; })()");
  harness.run(configureExpr(uniqueDbName("select")));

  auto result = harness.run("db.execute('SELECT 1 as one', [])");
  REQUIRE(result == R"({"columns":["one"],"rows":[[1]]})");
}

TEST_CASE("execute() round-trips insert/select/update/delete across column types", "[query]") {
  HybridDatabaseHarness harness;
  harness.run("(() => { globalThis.db = globalThis.NitroModulesProxy.createHybridObject('SalveDatabase'); return true; })()");
  harness.run(configureExpr(uniqueDbName("roundtrip")));

  harness.run(R"(
    db.registerSchema(JSON.stringify({
      name: 'items', version: 1, primaryKey: 'id',
      columns: {
        id: { type: 'integer' }, label: { type: 'text' }, price: { type: 'real' },
        active: { type: 'boolean' }, createdAt: { type: 'datetime' }
      }
    }))
  )");

  harness.run(
    "db.execute('INSERT INTO items (id, label, price, active, createdAt) VALUES (?, ?, ?, ?, ?)', "
    "[1, 'widget', 9.99, true, 1700000000000])");

  // MigrationEngine stores columns in a std::map, so CREATE TABLE emits them
  // alphabetically regardless of the schema's declaration order.
  auto selected = harness.run("db.execute('SELECT * FROM items WHERE id = 1', [])");
  REQUIRE(selected == R"({"columns":["active","createdAt","deletedAt","id","label","price"],"rows":[[true,1700000000000,null,1,"widget",9.99]]})");

  harness.run("db.execute('UPDATE items SET label = ? WHERE id = 1', ['widget-updated'])");
  auto updated = harness.run("db.execute('SELECT label FROM items WHERE id = 1', [])");
  REQUIRE(updated == R"({"columns":["label"],"rows":[["widget-updated"]]})");

  harness.run("db.execute('UPDATE items SET deletedAt = CAST(strftime(\\'%s\\',\\'now\\') * 1000 AS INTEGER) WHERE id = 1', [])");
  auto afterDelete = harness.run("db.execute('SELECT * FROM items WHERE id = 1 AND deletedAt IS NULL', [])");
  REQUIRE(afterDelete == R"({"columns":[],"rows":[]})");
}

TEST_CASE("transactions commit and roll back", "[transactions]") {
  HybridDatabaseHarness harness;
  harness.run("(() => { globalThis.db = globalThis.NitroModulesProxy.createHybridObject('SalveDatabase'); return true; })()");
  harness.run(configureExpr(uniqueDbName("tx")));
  harness.run("db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)', [])");

  SECTION("commit persists the write") {
    harness.run(R"(
      (async () => {
        await db.beginTransaction();
        await db.execute('INSERT INTO t (id) VALUES (1)', []);
        await db.commit();
        return true;
      })()
    )");
    auto rows = harness.run("db.execute('SELECT * FROM t', [])");
    REQUIRE(rows == R"({"columns":["id"],"rows":[[1]]})");
  }

  SECTION("rollback discards the write") {
    harness.run(R"(
      (async () => {
        await db.beginTransaction();
        await db.execute('INSERT INTO t (id) VALUES (1)', []);
        await db.rollback();
        return true;
      })()
    )");
    // No rows read means `columns` never gets populated (SQLiteConnection
    // only fills it on the first SQLITE_ROW), so an empty result is truly empty.
    auto rows = harness.run("db.execute('SELECT * FROM t', [])");
    REQUIRE(rows == R"({"columns":[],"rows":[]})");
  }

  SECTION("nested beginTransaction() is rejected") {
    CHECK_THROWS(harness.run(R"(
      (async () => {
        await db.beginTransaction();
        await db.beginTransaction();
      })()
    )"));
  }
}

TEST_CASE("execute() and transaction methods return synchronously, not a Promise", "[query][transactions]") {
  HybridDatabaseHarness harness;
  harness.run("(() => { globalThis.db = globalThis.NitroModulesProxy.createHybridObject('SalveDatabase'); return true; })()");
  harness.run(configureExpr(uniqueDbName("sync_contract")));

  auto result = harness.run(R"(
    (() => {
      const executeResult = db.execute('SELECT 1', []);
      const executeIsPromise = executeResult instanceof Promise;
      const beginResult = db.beginTransaction();
      const beginIsPromise = beginResult instanceof Promise;
      const commitResult = db.commit();
      const commitIsPromise = commitResult instanceof Promise;
      return { executeIsPromise, beginIsPromise, commitIsPromise };
    })()
  )");
  REQUIRE(result == R"({"executeIsPromise":false,"beginIsPromise":false,"commitIsPromise":false})");
}

TEST_CASE("prepared statement cache is reused for repeated SQL", "[cache]") {
  HybridDatabaseHarness harness;
  harness.run("(() => { globalThis.db = globalThis.NitroModulesProxy.createHybridObject('SalveDatabase'); return true; })()");
  harness.run(configureExpr(uniqueDbName("cache")));

  harness.run("db.execute('SELECT 1', [])");
  auto countAfterFirst = harness.run("db.debugPreparedStatementCount()");

  harness.run("db.execute('SELECT 1', [])");
  auto countAfterSecond = harness.run("db.debugPreparedStatementCount()");

  REQUIRE(countAfterFirst == countAfterSecond);
}

TEST_CASE("subscribeToChanges notifies JS after a write, across the async JSI thread hop", "[notify]") {
  HybridDatabaseHarness harness;
  harness.run("(() => { globalThis.db = globalThis.NitroModulesProxy.createHybridObject('SalveDatabase'); return true; })()");
  harness.run(configureExpr(uniqueDbName("subscribe")));
  harness.run("db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)', [])");

  auto subscribeReturnsNumber = harness.run(R"(
    (() => {
      globalThis.__received = null;
      const id = db.subscribeToChanges((tables) => { globalThis.__received = tables; });
      return typeof id;
    })()
  )");
  REQUIRE(subscribeReturnsNumber == R"("number")");

  harness.run("db.execute('INSERT INTO t (id) VALUES (1)', [])");

  // The subscriber callback is dispatched async (AsyncJSCallback), queued on
  // the same TestDispatcher `execute()` used above — a follow-up run() drains
  // it before returning, since its own completion is enqueued strictly after.
  auto received = harness.run("globalThis.__received");
  REQUIRE(received == R"(["t"])");
}

TEST_CASE("unsubscribeFromChanges stops further notifications", "[notify]") {
  HybridDatabaseHarness harness;
  harness.run("(() => { globalThis.db = globalThis.NitroModulesProxy.createHybridObject('SalveDatabase'); return true; })()");
  harness.run(configureExpr(uniqueDbName("unsubscribe")));
  harness.run("db.execute('CREATE TABLE t (id INTEGER PRIMARY KEY)', [])");

  harness.run(R"(
    (() => {
      globalThis.__count = 0;
      globalThis.__subId = db.subscribeToChanges(() => { globalThis.__count++; });
      return true;
    })()
  )");

  harness.run("db.execute('INSERT INTO t (id) VALUES (1)', [])");
  auto countAfterFirst = harness.run("globalThis.__count");
  REQUIRE(countAfterFirst == "1");

  harness.run("db.unsubscribeFromChanges(globalThis.__subId)");
  harness.run("db.execute('INSERT INTO t (id) VALUES (2)', [])");
  auto countAfterSecond = harness.run("globalThis.__count");
  REQUIRE(countAfterSecond == "1");
}

TEST_CASE("configure() defaults walMode to true", "[configure][wal]") {
  HybridDatabaseHarness harness;
  harness.run("(() => { globalThis.db = globalThis.NitroModulesProxy.createHybridObject('SalveDatabase'); return true; })()");
  harness.run(configureExpr(uniqueDbName("wal_default")));

  auto result = harness.run("db.execute('PRAGMA journal_mode', [])");
  REQUIRE(result == R"({"columns":["journal_mode"],"rows":[["wal"]]})");
}

TEST_CASE("configure({ walMode: false }) leaves the default (non-WAL) journal mode", "[configure][wal]") {
  HybridDatabaseHarness harness;
  harness.run("(() => { globalThis.db = globalThis.NitroModulesProxy.createHybridObject('SalveDatabase'); return true; })()");
  auto name = uniqueDbName("wal_disabled");
  harness.run("db.configure({ name: '" + name + "', walMode: false })");

  auto result = harness.run("db.execute('PRAGMA journal_mode', [])");
  REQUIRE(result == R"({"columns":["journal_mode"],"rows":[["delete"]]})");
}

TEST_CASE("blob ArrayBuffer params survive the async JSI thread hop", "[thread-safety]") {
  // Regression test for the bug where ArrayBuffer blob params were captured
  // by value and touched inside Promise::async's lambda off the JS thread
  // that created them. Runs many times to stress the crossing.
  HybridDatabaseHarness harness;
  harness.run("(() => { globalThis.db = globalThis.NitroModulesProxy.createHybridObject('SalveDatabase'); return true; })()");
  harness.run(configureExpr(uniqueDbName("blob")));
  harness.run("db.execute('CREATE TABLE blobs (id INTEGER PRIMARY KEY, payload BLOB)', [])");

  for (int i = 0; i < 25; i++) {
    harness.run(
      "db.execute('INSERT OR REPLACE INTO blobs (id, payload) VALUES (1, ?)', "
      "[new Uint8Array([1, 2, 3, 4, " + std::to_string(i) + "]).buffer])");

    auto result = harness.run(R"(
      (async () => {
        const rows = await db.execute('SELECT payload FROM blobs WHERE id = 1', []);
        return Array.from(new Uint8Array(rows.rows[0][0]));
      })()
    )");
    REQUIRE(result == "[1,2,3,4," + std::to_string(i) + "]");
  }
}
