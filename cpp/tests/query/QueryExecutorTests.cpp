#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include "../support/HybridDatabaseHarness.hpp"

using margelo::nitro::salvedb::tests::HybridDatabaseHarness;
using Catch::Matchers::ContainsSubstring;

namespace {

std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

std::string configureExpr(const std::string& name) {
  return "db.configure({ name: '" + name + "' })";
}

void createDb(HybridDatabaseHarness& harness, const std::string& name) {
  harness.run("(() => { globalThis.db = globalThis.NitroModulesProxy.createHybridObject('SalveDatabase'); return true; })()");
  harness.run(configureExpr(uniqueDbName(name)));
}

} // namespace

TEST_CASE("execute() coerces boolean columns to JS true/false, not 0/1", "[query][types]") {
  HybridDatabaseHarness harness;
  createDb(harness, "bool_coercion");

  harness.run(R"(
    db.registerSchema(JSON.stringify({
      name: 'flags', version: 1, primaryKey: 'id',
      columns: { id: { type: 'integer' }, enabled: { type: 'boolean' } }
    }))
  )");

  harness.run("db.execute('INSERT INTO flags (id, enabled) VALUES (?, ?), (?, ?)', [1, true, 2, false])");

  auto selected = harness.run("db.execute('SELECT id, enabled FROM flags ORDER BY id', [])");
  REQUIRE(selected == R"({"columns":["id","enabled"],"rows":[[1,true],[2,false]]})");
}

TEST_CASE("execute() scopes boolean coercion by table, not just column name", "[query][types]") {
  HybridDatabaseHarness harness;
  createDb(harness, "bool_table_scope");

  harness.run(R"(
    db.registerSchema(JSON.stringify({
      name: 'switches_bool', version: 1, primaryKey: 'id',
      columns: { id: { type: 'integer' }, flag: { type: 'boolean' } }
    }))
  )");
  // Same column name ('flag'), never registered as boolean — must stay a plain number.
  harness.run("db.execute('CREATE TABLE switches_int (id INTEGER PRIMARY KEY, flag INTEGER)', [])");

  harness.run("db.execute('INSERT INTO switches_bool (id, flag) VALUES (1, ?)', [true])");
  harness.run("db.execute('INSERT INTO switches_int (id, flag) VALUES (1, ?)', [5])");

  auto boolResult = harness.run("db.execute('SELECT flag FROM switches_bool WHERE id = 1', [])");
  REQUIRE(boolResult == R"({"columns":["flag"],"rows":[[true]]})");

  auto intResult = harness.run("db.execute('SELECT flag FROM switches_int WHERE id = 1', [])");
  REQUIRE(intResult == R"({"columns":["flag"],"rows":[[5]]})");
}

TEST_CASE("execute() boolean coercion follows column origin, not aliasing", "[query][types]") {
  HybridDatabaseHarness harness;
  createDb(harness, "bool_origin_boundary");

  harness.run(R"(
    db.registerSchema(JSON.stringify({
      name: 'toggles', version: 1, primaryKey: 'id',
      columns: { id: { type: 'integer' }, enabled: { type: 'boolean' } }
    }))
  )");
  harness.run("db.execute('INSERT INTO toggles (id, enabled) VALUES (1, ?)', [true])");

  SECTION("plain alias still resolves to the origin column") {
    auto aliased = harness.run("db.execute('SELECT enabled AS e FROM toggles WHERE id = 1', [])");
    REQUIRE(aliased == R"({"columns":["e"],"rows":[[true]]})");
  }

  SECTION("a computed expression has no column origin, falls back to a plain number") {
    auto computed = harness.run("db.execute('SELECT enabled + 0 AS e FROM toggles WHERE id = 1', [])");
    REQUIRE(computed == R"({"columns":["e"],"rows":[[1]]})");
  }

  SECTION("boolean coercion still applies to a column read through a JOIN") {
    harness.run("db.execute('CREATE TABLE labels (toggle_id INTEGER, label TEXT)', [])");
    harness.run("db.execute('INSERT INTO labels (toggle_id, label) VALUES (1, ?)', ['x'])");
    auto joined = harness.run(
      "db.execute('SELECT toggles.enabled FROM toggles JOIN labels ON labels.toggle_id = toggles.id', [])");
    REQUIRE(joined == R"({"columns":["enabled"],"rows":[[true]]})");
  }
}

TEST_CASE("execute() propagates a syntax error as a catchable, distinguishable JS error", "[query][errors]") {
  HybridDatabaseHarness harness;
  createDb(harness, "syntax_error");

  CHECK_THROWS_WITH(harness.run("db.execute('SELCT 1', [])"), ContainsSubstring("SQLITE_ERROR:"));
}

TEST_CASE("execute() propagates a constraint violation distinguishable from a syntax error", "[query][errors]") {
  HybridDatabaseHarness harness;
  createDb(harness, "constraint_error");
  harness.run("db.execute('CREATE TABLE uniq (id INTEGER PRIMARY KEY, code TEXT UNIQUE)', [])");
  harness.run("db.execute('INSERT INTO uniq (id, code) VALUES (1, ?)', ['A'])");

  CHECK_THROWS_WITH(
    harness.run("db.execute('INSERT INTO uniq (id, code) VALUES (2, ?)', ['A'])"),
    ContainsSubstring("SQLITE_CONSTRAINT:"));
}

TEST_CASE("execute() writes through db.execute fire sync triggers into sync_queue", "[query][sync]") {
  HybridDatabaseHarness harness;
  createDb(harness, "trigger_via_bridge");

  harness.run(R"(
    db.registerSchema(JSON.stringify({
      name: 'notes', version: 1, primaryKey: 'id',
      columns: { id: { type: 'integer' }, body: { type: 'text' } },
      sync: { enabled: true }
    }))
  )");

  harness.run("db.execute('INSERT INTO notes (id, body) VALUES (1, ?)', ['hello'])");
  harness.run("db.execute('UPDATE notes SET body = ? WHERE id = 1', ['updated'])");
  harness.run("db.execute('DELETE FROM notes WHERE id = 1', [])");

  auto queued = harness.run("db.execute('SELECT operation, entity FROM sync_queue ORDER BY id', [])");
  REQUIRE(queued == R"({"columns":["operation","entity"],"rows":[["insert","notes"],["update","notes"],["delete","notes"]]})");
}
