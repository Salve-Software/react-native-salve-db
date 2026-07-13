#include <catch2/catch_test_macros.hpp>
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"

using namespace margelo::nitro::salvedb;

TEST_CASE("SQLiteConnection defaults to WAL journal mode", "[sqlite][wal]") {
  SQLiteConnection conn(platform::getDocumentsDirectory() + "/wal_default_test.db");

  auto result = conn.execute("PRAGMA journal_mode", {});
  REQUIRE(std::get<std::string>(result.rows[0][0]) == "wal");
}

TEST_CASE("SQLiteConnection(walMode=false) leaves the default (non-WAL) journal mode", "[sqlite][wal]") {
  SQLiteConnection conn(platform::getDocumentsDirectory() + "/wal_disabled_test.db", /*walMode=*/false);

  auto result = conn.execute("PRAGMA journal_mode", {});
  REQUIRE(std::get<std::string>(result.rows[0][0]) == "delete");
}
