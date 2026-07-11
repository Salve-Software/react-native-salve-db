#include <catch2/catch_test_macros.hpp>
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include <algorithm>
#include <atomic>
#include <thread>
#include <vector>

using namespace margelo::nitro::salvedb;

namespace {
// SQLiteConnection is non-copyable and (despite the header comment) has no
// usable move constructor either, since it declares a custom destructor —
// so it can't be returned by value. Each test constructs its own connection
// in place and calls this to set up the shared test tables.
void setUpNotifTables(SQLiteConnection& conn) {
  conn.exec("DROP TABLE IF EXISTS notif_a");
  conn.exec("DROP TABLE IF EXISTS notif_b");
  conn.exec("CREATE TABLE notif_a (id INTEGER PRIMARY KEY AUTOINCREMENT, value INTEGER)");
  conn.exec("CREATE TABLE notif_b (id INTEGER PRIMARY KEY AUTOINCREMENT, value INTEGER)");
}
} // namespace

TEST_CASE("subscribe() fires once per write outside a transaction, with the touched table", "[notify]") {
  SQLiteConnection conn(platform::getDocumentsDirectory() + "/notify_single.db");
  setUpNotifTables(conn);

  std::vector<std::vector<std::string>> received;
  conn.subscribe([&](std::vector<std::string> tables) { received.push_back(tables); });

  conn.execute("INSERT INTO notif_a (value) VALUES (?)", {static_cast<double>(1)});

  REQUIRE(received.size() == 1);
  REQUIRE(received[0] == std::vector<std::string>{"notif_a"});
}

TEST_CASE("multiple writes inside an explicit transaction coalesce into one notification", "[notify][transactions]") {
  SQLiteConnection conn(platform::getDocumentsDirectory() + "/notify_txn.db");
  setUpNotifTables(conn);

  std::vector<std::vector<std::string>> received;
  conn.subscribe([&](std::vector<std::string> tables) { received.push_back(tables); });

  conn.beginTransaction();
  conn.execute("INSERT INTO notif_a (value) VALUES (?)", {static_cast<double>(1)});
  conn.execute("INSERT INTO notif_b (value) VALUES (?)", {static_cast<double>(2)});
  conn.execute("INSERT INTO notif_a (value) VALUES (?)", {static_cast<double>(3)});
  REQUIRE(received.empty()); // no flush yet, still inside the transaction
  conn.commit();

  REQUIRE(received.size() == 1);
  auto& tables = received[0];
  REQUIRE(tables.size() == 2);
  REQUIRE(std::find(tables.begin(), tables.end(), "notif_a") != tables.end());
  REQUIRE(std::find(tables.begin(), tables.end(), "notif_b") != tables.end());
}

TEST_CASE("rollback() discards touched tables without notifying", "[notify][transactions]") {
  SQLiteConnection conn(platform::getDocumentsDirectory() + "/notify_rollback.db");
  setUpNotifTables(conn);

  std::vector<std::vector<std::string>> received;
  conn.subscribe([&](std::vector<std::string> tables) { received.push_back(tables); });

  conn.beginTransaction();
  conn.execute("INSERT INTO notif_a (value) VALUES (?)", {static_cast<double>(1)});
  conn.rollback();

  REQUIRE(received.empty());

  // A subsequent, unrelated write must not carry over the rolled-back table.
  conn.execute("INSERT INTO notif_b (value) VALUES (?)", {static_cast<double>(2)});
  REQUIRE(received.size() == 1);
  REQUIRE(received[0] == std::vector<std::string>{"notif_b"});
}

TEST_CASE("unsubscribe() stops further notifications", "[notify]") {
  SQLiteConnection conn(platform::getDocumentsDirectory() + "/notify_unsub.db");
  setUpNotifTables(conn);

  int callCount = 0;
  int id = conn.subscribe([&](std::vector<std::string>) { callCount++; });

  conn.execute("INSERT INTO notif_a (value) VALUES (?)", {static_cast<double>(1)});
  REQUIRE(callCount == 1);

  conn.unsubscribe(id);
  conn.execute("INSERT INTO notif_a (value) VALUES (?)", {static_cast<double>(2)});
  REQUIRE(callCount == 1);
}

TEST_CASE("concurrent writes from multiple threads notify without crashing or deadlocking", "[notify][thread-safety]") {
  SQLiteConnection conn(platform::getDocumentsDirectory() + "/notify_concurrency.db");
  setUpNotifTables(conn);

  std::atomic<int> notifications{0};
  std::atomic<int> errors{0};
  conn.subscribe([&](std::vector<std::string>) { notifications++; });

  constexpr int kThreads = 8;
  constexpr int kIterationsPerThread = 100;

  std::vector<std::thread> threads;
  for (int t = 0; t < kThreads; ++t) {
    threads.emplace_back([&conn, &errors, t]() {
      for (int i = 0; i < kIterationsPerThread; ++i) {
        try {
          conn.execute("INSERT INTO notif_a (value) VALUES (?)", {static_cast<double>(t * 10000 + i)});
        } catch (const std::exception&) {
          errors++;
        }
      }
    });
  }
  for (auto& th : threads) th.join();

  REQUIRE(errors == 0);
  REQUIRE(notifications == kThreads * kIterationsPerThread);
}
