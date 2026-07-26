#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/SyncCursorStore.hpp"
#include <memory>

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbPath(const std::string& testName) {
  static int counter = 0;
  return platform::getDocumentsDirectory() + "/" + testName + "_" + std::to_string(++counter) + ".db";
}

std::shared_ptr<SQLiteConnection> openWithCursorTable(const std::string& testName) {
  auto conn = std::make_shared<SQLiteConnection>(uniqueDbPath(testName));
  MigrationEngine engine(conn);
  // registerSchema creates the global sync tables (_salve_sync_cursors included).
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "widgets", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" } }
  })"));
  return conn;
}

} // namespace

TEST_CASE("load returns nullopt when no cursor was ever saved", "[sync][SyncCursorStore]") {
  auto conn = openWithCursorTable("cursor_missing");
  SyncCursorStore store(conn);
  REQUIRE_FALSE(store.load("customers").has_value());
}

TEST_CASE("save/load round-trips the cursor for an entity", "[sync][SyncCursorStore]") {
  auto conn = openWithCursorTable("cursor_roundtrip");
  SyncCursorStore store(conn);

  store.save("customers", "\"abc123\"");
  REQUIRE(store.load("customers").value() == "\"abc123\"");
}

TEST_CASE("save overwrites a previously stored cursor for the same entity", "[sync][SyncCursorStore]") {
  auto conn = openWithCursorTable("cursor_overwrite");
  SyncCursorStore store(conn);

  store.save("customers", "\"first\"");
  store.save("customers", "\"second\"");
  REQUIRE(store.load("customers").value() == "\"second\"");
}

TEST_CASE("cursors are isolated per entity", "[sync][SyncCursorStore]") {
  auto conn = openWithCursorTable("cursor_per_entity");
  SyncCursorStore store(conn);

  store.save("customers", "\"customers-cursor\"");
  store.save("orders", "\"orders-cursor\"");

  REQUIRE(store.load("customers").value() == "\"customers-cursor\"");
  REQUIRE(store.load("orders").value() == "\"orders-cursor\"");
}

TEST_CASE("a saved cursor survives constructing a new SyncCursorStore over the same connection", "[sync][SyncCursorStore]") {
  auto conn = openWithCursorTable("cursor_persists_restart");
  { SyncCursorStore(conn).save("customers", "\"before-restart\""); }

  SyncCursorStore reopened(conn);
  REQUIRE(reopened.load("customers").value() == "\"before-restart\"");
}
