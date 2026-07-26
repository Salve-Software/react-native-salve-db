#include <catch2/catch_test_macros.hpp>
#include "../../database/SQLiteConnection.hpp"
#include "../../platform/platform.hpp"
#include <atomic>
#include <thread>
#include <vector>

using namespace margelo::nitro::salvedb;

// Regression test for the LRU prepared-statement cache race: execute() now
// runs synchronously on the JS thread, so it directly contends with any
// background writer (e.g. the sync engine) hitting the same connection.
// Real std::threads hammer the same SQLiteConnection concurrently — no JSI
// involved, this exercises SQLiteConnection's own locking directly.
TEST_CASE("SQLiteConnection::execute is safe under real concurrent threads", "[cache][thread-safety]") {
  SQLiteConnection conn(platform::getDocumentsDirectory() + "/concurrency_test.db");
  conn.exec("DROP TABLE IF EXISTS concurrency_t");
  conn.exec("CREATE TABLE concurrency_t (id INTEGER PRIMARY KEY AUTOINCREMENT, value INTEGER)");

  constexpr int kThreads = 8;
  constexpr int kIterationsPerThread = 200;
  std::atomic<int> errors{0};

  std::vector<std::thread> threads;
  for (int t = 0; t < kThreads; ++t) {
    threads.emplace_back([&conn, &errors, t]() {
      for (int i = 0; i < kIterationsPerThread; ++i) {
        try {
          conn.execute("INSERT INTO concurrency_t (value) VALUES (?)", {static_cast<double>(t * 10000 + i)});
          conn.execute("SELECT COUNT(*) FROM concurrency_t", {});
        } catch (const std::exception&) {
          errors++;
        }
      }
    });
  }
  for (auto& th : threads) th.join();

  REQUIRE(errors == 0);

  auto result = conn.execute("SELECT COUNT(*) FROM concurrency_t", {});
  REQUIRE(std::get<double>(result.rows[0][0]) == static_cast<double>(kThreads * kIterationsPerThread));
}
