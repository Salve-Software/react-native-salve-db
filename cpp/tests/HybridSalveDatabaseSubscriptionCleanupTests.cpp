#include <catch2/catch_test_macros.hpp>
#include "../HybridSalveDatabase.hpp"
#include "../database/DatabaseManager.hpp"

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

} // namespace

TEST_CASE("~HybridSalveDatabase() unsubscribes its own subscriptions from the still-open connection", "[database][notify][cleanup]") {
  DatabaseManager::shared().open(uniqueDbName("subscription_cleanup"));
  auto conn = DatabaseManager::shared().connection();
  conn->exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");

  int callCount = 0;
  {
    auto db = std::make_shared<HybridSalveDatabase>();
    db->subscribeToChanges([&](const std::vector<std::string>&) { callCount++; });

    conn->execute("INSERT INTO t (id) VALUES (?)", {1.0});
    REQUIRE(callCount == 1);
  } // db destructs here — must unsubscribe, since DatabaseManager keeps the same connection alive.

  conn->execute("INSERT INTO t (id) VALUES (?)", {2.0});
  REQUIRE(callCount == 1); // unchanged — the dead subscription no longer fires
}
