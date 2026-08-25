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

TEST_CASE("~HybridSalveDatabase() does not unsubscribe a same-id subscriber on a replacement connection", "[database][notify][cleanup]") {
  // DatabaseManager::open() with a different db name replaces the shared
  // connection outright; SQLiteConnection's subscriber id counter starts
  // fresh per instance, so the first subscriber on the new connection can
  // legitimately reuse the same numeric id as one on the old connection.
  DatabaseManager::shared().open(uniqueDbName("subscription_cross_conn_a"));
  auto connA = DatabaseManager::shared().connection();
  connA->exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");

  auto dbA = std::make_shared<HybridSalveDatabase>();
  double idA = dbA->subscribeToChanges([](const std::vector<std::string>&) {});

  DatabaseManager::shared().open(uniqueDbName("subscription_cross_conn_b"));
  auto connB = DatabaseManager::shared().connection();
  connB->exec("CREATE TABLE t (id INTEGER PRIMARY KEY)");

  int callCountB = 0;
  double idB = DatabaseManager::shared().connection()->subscribe(
    [&](std::vector<std::string>) { callCountB++; }
  );
  REQUIRE(static_cast<int>(idA) == static_cast<int>(idB)); // same id, different connection — the case that must not collide

  dbA.reset(); // destructs — must unsubscribe against connA specifically, never against the now-current connB

  connB->execute("INSERT INTO t (id) VALUES (?)", {1.0});
  REQUIRE(callCountB == 1); // connB's subscriber survived dbA's teardown

  connB->unsubscribe(static_cast<int>(idB));
}
