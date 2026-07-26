#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include "../../database/DatabaseManager.hpp"
#include "../../database/MigrationEngine.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/SyncCursorStore.hpp"
#include "../../sync/SyncOrchestrator.hpp"
#include "../support/platform_test.hpp"
#include <atomic>
#include <chrono>
#include <functional>
#include <thread>
#include <vector>

using namespace margelo::nitro::salvedb;
using Catch::Matchers::ContainsSubstring;

namespace {

std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

void resetSecureStore() {
  platform::deleteSecureValue("salvedb.credentials.accessToken");
  platform::deleteSecureValue("salvedb.credentials.refreshToken");
}

// Opens a fresh DatabaseManager-backed fixture: a "customers" schema on the
// REST contract, seeded credentials and network config — SyncOrchestrator
// pulls all of this from DatabaseManager::shared() itself.
std::shared_ptr<SQLiteConnection> openOrchestratorFixture(
  const std::string& testName, int pageSize = 20, int maxPagesPerSession = 20
) {
  resetSecureStore();

  DatabaseManager::shared().open(uniqueDbName(testName));
  MigrationEngine engine(DatabaseManager::shared().connection());
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "name": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": {
      "enabled": true,
      "endpoint": { "basePath": "/customers", "sinceParam": "updatedAfter", "limitParam": "limit" },
      "pagination": { "pageSize": )" + std::to_string(pageSize) + R"(, "maxPagesPerSession": )" + std::to_string(maxPagesPerSession) + R"( }
    }
  })"));

  DatabaseManager::shared().configureCredentials(
    "oauth2", "Authorization", "/auth/refresh", "$.accessToken", "$.refreshToken",
    InitialCredentialTokens{"access-1", "refresh-1"}
  );
  DatabaseManager::shared().configureNetwork("https://api.company.com", 5000.0);

  return DatabaseManager::shared().connection();
}

int syncQueueCount(SQLiteConnection& conn, const std::string& entity) {
  auto rows = conn.execute("SELECT COUNT(*) FROM sync_queue WHERE entity = ?", { entity });
  return static_cast<int>(std::get<double>(rows.rows[0][0]));
}

using RouteHandler = std::function<HttpOutcome(const HttpRequest&)>;

// Routes the test HTTP mock by verb — list/create/update/remove are always
// distinct HTTP methods under the REST contract, so no URL parsing is needed
// beyond what a handler chooses to inspect itself.
void respondByRoute(RouteHandler onList, RouteHandler onCreate, RouteHandler onUpdate, RouteHandler onDelete) {
  platform::test::setHttpExecuteResult([=](const HttpRequest& request) -> HttpOutcome {
    switch (request.method) {
      case HttpMethod::Get:    return onList ? onList(request) : HttpOutcome{HttpResponse{200, {}, "[]"}};
      case HttpMethod::Post:   return onCreate ? onCreate(request) : HttpOutcome{HttpResponse{201, {}, "{}"}};
      case HttpMethod::Patch:  return onUpdate ? onUpdate(request) : HttpOutcome{HttpResponse{200, {}, "{}"}};
      case HttpMethod::Delete: return onDelete ? onDelete(request) : HttpOutcome{HttpResponse{204, {}, ""}};
      default: throw std::runtime_error("unexpected HTTP method in test mock");
    }
  });
}

HttpResponse emptyList() { return HttpResponse{200, {}, "[]"}; }

// Holds the sync mutex from a background thread — same-thread lock+tryLock is UB.
class LockHolder {
public:
  LockHolder() {
    _thread = std::thread([this]() {
      auto held = DatabaseManager::shared().lockSync();
      _ready.store(true);
      while (!_release.load()) std::this_thread::sleep_for(std::chrono::milliseconds(5));
    });
    while (!_ready.load()) std::this_thread::sleep_for(std::chrono::milliseconds(5));
  }
  ~LockHolder() {
    _release.store(true);
    _thread.join();
  }
  LockHolder(const LockHolder&) = delete;
  LockHolder& operator=(const LockHolder&) = delete;

private:
  std::thread _thread;
  std::atomic<bool> _ready{false};
  std::atomic<bool> _release{false};
};

} // namespace

// ── Locking (unchanged by the #84 rewrite) ────────────────────────────────

TEST_CASE("DatabaseManager::tryLockSync fails while another thread holds lockSync", "[sync][SyncOrchestrator][concurrency]") {
  openOrchestratorFixture("orchestrator_lock_contention");

  LockHolder holder;

  auto contended = DatabaseManager::shared().tryLockSync();
  REQUIRE_FALSE(contended.owns_lock());
}

TEST_CASE("concurrent triggerSync calls are serialized instead of racing into a nested transaction", "[sync][SyncOrchestrator][concurrency]") {
  auto conn = openOrchestratorFixture("orchestrator_concurrent_sessions");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});

  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    return HttpResponse{200, {}, "[]"};
  });

  std::atomic<int> errors{0};
  std::vector<std::thread> threads;
  for (int i = 0; i < 4; ++i) {
    threads.emplace_back([&errors]() {
      try {
        SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);
      } catch (const std::exception&) {
        ++errors;
      }
    });
  }
  for (auto& th : threads) th.join();

  // Before the sync-session mutex, this reliably threw "Nested transactions
  // are not supported" — SyncApplyGuard::applyWithBypass opens a real
  // transaction, and four sessions raced into it concurrently.
  REQUIRE(errors == 0);
}

TEST_CASE("triggerSyncAll discards silently when a sync session is already in progress", "[sync][SyncOrchestrator][concurrency]") {
  openOrchestratorFixture("orchestrator_all_discard");

  LockHolder holder;

  auto results = SyncOrchestrator().triggerSyncAll(/*discardIfBusy*/ true);

  REQUIRE(results.empty());
}

TEST_CASE("triggerSync discards silently when a sync session is already in progress", "[sync][SyncOrchestrator][concurrency]") {
  auto conn = openOrchestratorFixture("orchestrator_single_discard");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});

  int calls = 0;
  platform::test::setHttpExecuteResult([&](const HttpRequest&) -> HttpOutcome {
    ++calls;
    return emptyList();
  });

  LockHolder holder;

  auto result = SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ true);

  REQUIRE_FALSE(result.has_value());
  REQUIRE(calls == 0); // no request went out — the session never started
  SyncCursorStore cursorStore(conn);
  REQUIRE_FALSE(cursorStore.load("customers").has_value()); // cursor untouched
  REQUIRE(syncQueueCount(*conn, "customers") == 1); // pushed row still pending
}

TEST_CASE("triggerSync with discardIfBusy runs normally when no session is in progress", "[sync][SyncOrchestrator][concurrency]") {
  auto conn = openOrchestratorFixture("orchestrator_single_discard_not_busy");

  respondByRoute(nullptr, nullptr, nullptr, nullptr);

  auto result = SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ true);

  REQUIRE(result.has_value()); // discardIfBusy=true is not a no-op — runs when free
}

TEST_CASE("triggerSync with discardIfBusy=false waits for an in-progress session instead of discarding", "[sync][SyncOrchestrator][concurrency]") {
  openOrchestratorFixture("orchestrator_single_waits");
  respondByRoute(nullptr, nullptr, nullptr, nullptr);

  auto held = DatabaseManager::shared().lockSync();

  std::atomic<bool> resultReady{false};
  std::optional<NativeSyncResult> result;
  std::thread t([&]() {
    result = SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);
    resultReady = true;
  });

  std::this_thread::sleep_for(std::chrono::milliseconds(100));
  REQUIRE_FALSE(resultReady.load()); // still waiting on the lock, not discarded

  held.unlock();
  t.join();

  REQUIRE(resultReady.load());
  REQUIRE(result.has_value());
}

// ── Full session shape ─────────────────────────────────────────────────────

TEST_CASE("triggerSync runs a full session: pushes the queue, pulls, persists the cursor, clears the queue", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_full_cycle");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('local1', 'a', 100)", {});

  respondByRoute(
    /*list*/ [](const HttpRequest&) -> HttpOutcome { return HttpResponse{200, {}, R"([{"id":"srv1","name":"server-row","updatedAt":500}])"}; },
    /*create*/ [](const HttpRequest&) -> HttpOutcome { return HttpResponse{201, {}, R"({"id":"local1","name":"a","updatedAt":100})"}; },
    nullptr, nullptr
  );

  auto result = SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE(result.has_value());
  REQUIRE(result->operationsApplied == 2.0);
  REQUIRE(result->inserted == 1.0); // srv1 pulled
  REQUIRE(result->updated == 1.0);  // local1 replaced
  REQUIRE(result->cursor.value() == "499"); // 500 - 1ms, see D6

  REQUIRE(syncQueueCount(*conn, "customers") == 0);
  auto rows = conn->execute("SELECT COUNT(*) FROM customers", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 2.0);
}

TEST_CASE("push: N queued items become N sequential POST/PATCH/DELETE calls in one session", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_sequential");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('2', 'b', 100)", {});
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('3', 'c', 100)", {});

  int creates = 0;
  respondByRoute(
    nullptr,
    [&](const HttpRequest& request) -> HttpOutcome {
      ++creates;
      return HttpResponse{201, {}, *request.body};
    },
    nullptr, nullptr
  );

  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE(creates == 3);
  REQUIRE(syncQueueCount(*conn, "customers") == 0);
}

TEST_CASE("applyReplace's PRAGMA table_info runs once per session, not once per pushed item (P1)", "[sync][SyncOrchestrator]") {
  auto connOne = openOrchestratorFixture("orchestrator_pragma_cache_one");
  connOne->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});
  respondByRoute(nullptr, [](const HttpRequest& request) -> HttpOutcome { return HttpResponse{201, {}, *request.body}; }, nullptr, nullptr);
  size_t before1 = connOne->prepareCount();
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);
  size_t costOneItem = connOne->prepareCount() - before1;

  auto connTwo = openOrchestratorFixture("orchestrator_pragma_cache_two");
  connTwo->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});
  connTwo->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('2', 'b', 100)", {});
  respondByRoute(nullptr, [](const HttpRequest& request) -> HttpOutcome { return HttpResponse{201, {}, *request.body}; }, nullptr, nullptr);
  size_t before2 = connTwo->prepareCount();
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);
  size_t costTwoItems = connTwo->prepareCount() - before2;

  size_t marginalSecondItem = costTwoItems - costOneItem;
  // Without the per-session TableColumns cache, every item pays its own
  // PRAGMA table_info, so the 2nd item's marginal cost would match the 1st's.
  // With the cache, only the 1st item pays it — the 2nd must be strictly cheaper.
  REQUIRE(marginalSecondItem < costOneItem);
}

TEST_CASE("pull: pages across N calls while each page comes back full", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_pull_pagination", /*pageSize*/ 1, /*maxPagesPerSession*/ 20);

  int calls = 0;
  respondByRoute(
    [&](const HttpRequest&) -> HttpOutcome {
      ++calls;
      if (calls > 2) return emptyList();
      return HttpResponse{200, {}, R"([{"id":"srv)" + std::to_string(calls) + R"(","name":"x","updatedAt":)" + std::to_string(calls * 100) + "}]"};
    },
    nullptr, nullptr, nullptr
  );

  auto result = SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE(calls == 3); // 2 full pages + 1 empty page to detect the end
  REQUIRE(result->inserted == 2.0);
}

TEST_CASE("a pulled page's last row without a numeric updatedAt/deletedAt fails loudly instead of corrupting the cursor (L1)", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_pull_missing_timestamp", /*pageSize*/ 1, /*maxPagesPerSession*/ 20);
  // Pre-existing local row newer than the malformed remote row (remoteTimestamp
  // defaults to 0 with neither field present), so apply() takes the
  // lastWriteWins skip path and never attempts a write — isolating the
  // assertion to the cursor computation itself, not an unrelated NOT NULL failure.
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('srv1', 'a', 999)", {});

  respondByRoute(
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{200, {}, R"([{"id":"srv1","name":"x"}])"}; },
    nullptr, nullptr, nullptr
  );

  REQUIRE_THROWS_WITH(
    SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false),
    ContainsSubstring("no numeric updatedAt or deletedAt")
  );

  SyncCursorStore cursorStore(conn);
  REQUIRE_FALSE(cursorStore.load("customers").has_value());
}

TEST_CASE("a page tied on the same millisecond as the cursor stops the session instead of looping or regressing (L1)", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_pull_stalled_cursor", /*pageSize*/ 2, /*maxPagesPerSession*/ 20);

  int calls = 0;
  respondByRoute(
    [&](const HttpRequest&) -> HttpOutcome {
      ++calls;
      return HttpResponse{200, {}, R"([{"id":"srv1","name":"x","updatedAt":1},{"id":"srv2","name":"y","updatedAt":1}])"};
    },
    nullptr, nullptr, nullptr
  );

  auto result = SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE(calls == 1); // stops after the stalled page instead of re-fetching it forever
  REQUIRE(result->inserted == 2.0);

  SyncCursorStore cursorStore(conn);
  REQUIRE_FALSE(cursorStore.load("customers").has_value());
}

TEST_CASE("pull stops at maxPagesPerSession and a later call resumes from the persisted cursor", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_page_cutoff", /*pageSize*/ 1, /*maxPagesPerSession*/ 2);

  int calls = 0;
  respondByRoute(
    [&](const HttpRequest&) -> HttpOutcome {
      ++calls;
      // Always a full page, to prove the session stops on its own cap, not on data running out.
      return HttpResponse{200, {}, R"([{"id":"srv)" + std::to_string(calls) + R"(","name":"x","updatedAt":)" + std::to_string(calls * 100) + "}]"};
    },
    nullptr, nullptr, nullptr
  );

  auto first = SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);
  REQUIRE(first.has_value());
  REQUIRE(calls == 2);
  REQUIRE(first->cursor.value() == "199"); // 200 - 1

  auto second = SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);
  REQUIRE(second.has_value());
  REQUIRE(calls == 4);
  REQUIRE(second->cursor.value() == "399"); // 400 - 1
}

TEST_CASE("a row pulled from the server does not get re-queued into sync_queue", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_no_reentry");

  respondByRoute(
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{200, {}, R"([{"id":"srv1","name":"from-server","updatedAt":100}])"}; },
    nullptr, nullptr, nullptr
  );

  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE(syncQueueCount(*conn, "customers") == 0);
}

TEST_CASE("pull with a 2xx non-JSON body fails with SyncPullPhase's own message, not an opaque parse error (L7)", "[sync][SyncOrchestrator]") {
  openOrchestratorFixture("orchestrator_pull_invalid_2xx_body");

  respondByRoute(
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{200, {}, "<html>ok</html>"}; },
    nullptr, nullptr, nullptr
  );

  REQUIRE_THROWS_WITH(
    SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false),
    ContainsSubstring("expected a bare JSON array")
  );
}

TEST_CASE("an error mid-apply rolls back the whole pull page: no partial writes, lock cleared, cursor untouched", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_apply_rollback");

  respondByRoute(
    // "name" is a known column, but an object value makes toSqlValue throw.
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{200, {}, R"([{"id":"srv1","name":{"bad":"value"},"updatedAt":500}])"}; },
    nullptr, nullptr, nullptr
  );

  REQUIRE_THROWS(SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false));

  auto srv1 = conn->execute("SELECT COUNT(*) FROM customers WHERE id = 'srv1'", {});
  REQUIRE(std::get<double>(srv1.rows[0][0]) == 0.0);

  auto lockRows = conn->execute("SELECT COUNT(*) FROM _sync_apply_lock", {});
  REQUIRE(std::get<double>(lockRows.rows[0][0]) == 0.0);

  SyncCursorStore cursorStore(conn);
  REQUIRE_FALSE(cursorStore.load("customers").has_value());
}

TEST_CASE("triggerSyncAll runs every enabled schema, isolating one schema's failure from the rest", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_all_isolation");
  MigrationEngine engine(conn);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": {
      "enabled": true,
      "endpoint": { "basePath": "/orders", "sinceParam": "updatedAfter", "limitParam": "limit" }
    }
  })"));

  platform::test::setHttpExecuteResult([](const HttpRequest& request) -> HttpOutcome {
    if (request.url.find("/customers") != std::string::npos) {
      return HttpResponse{500, {}, "boom"};
    }
    return HttpResponse{200, {}, "[]"};
  });

  auto results = SyncOrchestrator().triggerSyncAll(/*discardIfBusy*/ false);

  REQUIRE(results.size() == 1); // "customers" failed and was skipped; "orders" still ran
}

TEST_CASE("triggerSyncAll stops at the first network failure instead of retrying every remaining schema (P3)", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_all_network_stop");
  MigrationEngine engine(conn);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": {
      "enabled": true,
      "endpoint": { "basePath": "/orders", "sinceParam": "updatedAfter", "limitParam": "limit" }
    }
  })"));

  bool ordersEndpointCalled = false;
  platform::test::setHttpExecuteResult([&](const HttpRequest& request) -> HttpOutcome {
    if (request.url.find("/orders") != std::string::npos) {
      ordersEndpointCalled = true;
      return HttpResponse{200, {}, "[]"};
    }
    return HttpNetworkError{HttpNetworkErrorKind::NoConnection, "no connection"};
  });

  auto results = SyncOrchestrator().triggerSyncAll(/*discardIfBusy*/ false);

  REQUIRE(results.empty()); // "customers" (alphabetically first) failed on the network
  REQUIRE_FALSE(ordersEndpointCalled); // "orders" was never even attempted
}

// ── Push: per-item HTTP failure isolation (the core behavior change) ──────

TEST_CASE("an HTTP failure on one push item marks it FAILED and the session continues with the next", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_item_failed");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('2', 'b', 100)", {});

  int creates = 0;
  respondByRoute(
    nullptr,
    [&](const HttpRequest& request) -> HttpOutcome {
      ++creates;
      if (creates == 1) return HttpResponse{400, {}, R"({"error": "bad request"})"};
      return HttpResponse{201, {}, *request.body};
    },
    nullptr, nullptr
  );

  auto result = SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE(result.has_value());
  REQUIRE(creates == 2); // item 2 still ran after item 1 failed
  REQUIRE(syncQueueCount(*conn, "customers") == 1); // the failed item stays queued

  auto meta = conn->execute("SELECT status, retryCount FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "FAILED");
  REQUIRE(std::get<double>(meta.rows[0][1]) == 1.0);

  // L6: the failure must reach _salve_sync_metadata too, not just sync_queue.
  auto metaRow = conn->execute(
    "SELECT status, retryCount FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = '1'", {});
  REQUIRE(std::get<std::string>(metaRow.rows[0][0]) == "FAILED");
  REQUIRE(std::get<double>(metaRow.rows[0][1]) == 1.0);
}

TEST_CASE("a FAILED item is retried, with no intervention, on the next session", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_item_retry");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});

  respondByRoute(nullptr, [](const HttpRequest&) -> HttpOutcome { return HttpResponse{400, {}, "{}"}; }, nullptr, nullptr);
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  respondByRoute(nullptr, [](const HttpRequest&) -> HttpOutcome { return HttpResponse{400, {}, "{}"}; }, nullptr, nullptr);
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  auto row = conn->execute("SELECT retryCount FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(std::get<double>(row.rows[0][0]) == 2.0);
}

TEST_CASE("a network failure mid-push aborts the rest of the push phase and never runs the pull", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_network_abort");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('2', 'b', 100)", {});
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('3', 'c', 100)", {});

  int creates = 0;
  bool listCalled = false;
  respondByRoute(
    [&](const HttpRequest&) -> HttpOutcome { listCalled = true; return emptyList(); },
    [&](const HttpRequest& request) -> HttpOutcome {
      ++creates;
      if (creates == 1) return HttpResponse{201, {}, *request.body};
      return HttpNetworkError{HttpNetworkErrorKind::NoConnection, "no connection"};
    },
    nullptr, nullptr
  );

  REQUIRE_THROWS_AS(SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false), std::runtime_error);

  REQUIRE_FALSE(listCalled); // pull never ran
  REQUIRE(syncQueueCount(*conn, "customers") == 2); // item 1 applied+removed, items 2-3 stay PENDING

  auto pending = conn->execute("SELECT COUNT(*) FROM sync_queue WHERE entity = 'customers' AND status = 'PENDING'", {});
  REQUIRE(std::get<double>(pending.rows[0][0]) == 2.0);
}

// ── Pull: initial sync, tombstones ─────────────────────────────────────────

TEST_CASE("initial pull on an empty table inserts rows and marks metadata SYNCED with remoteId=entityId=id", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_initial_pull");

  respondByRoute(
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{200, {}, R"([{"id":"srv1","name":"alice","updatedAt":100}])"}; },
    nullptr, nullptr, nullptr
  );

  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  auto meta = conn->execute(
    "SELECT localId, entityId, remoteId, status FROM _salve_sync_metadata WHERE tableName = 'customers'", {});
  REQUIRE(meta.rows.size() == 1);
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "srv1");
  REQUIRE(std::get<std::string>(meta.rows[0][1]) == "srv1");
  REQUIRE(std::get<std::string>(meta.rows[0][2]) == "srv1");
  REQUIRE(std::get<std::string>(meta.rows[0][3]) == "SYNCED");
}

TEST_CASE("a tombstone without updatedAt soft-deletes the local row, independent of any operation field", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_pull_tombstone");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('srv1', 'alice', 100)", {});

  respondByRoute(
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{200, {}, R"([{"id":"srv1","deletedAt":150}])"}; },
    nullptr, nullptr, nullptr
  );

  auto result = SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE(result->deleted == 1.0);
  auto row = conn->execute("SELECT deletedAt FROM customers WHERE id = 'srv1'", {});
  REQUIRE(std::get<double>(row.rows[0][0]) == 150.0);
}

// ── Push: Replace Transaction, verb selection ──────────────────────────────

TEST_CASE("POST response id rewrites the PK, marks metadata SYNCED, no duplication", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_create_replace");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});

  respondByRoute(nullptr,
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{201, {}, R"({"id":"srv-1","name":"alice","updatedAt":100})"}; },
    nullptr, nullptr
  );

  auto result = SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE(result->updated == 1.0);
  REQUIRE(syncQueueCount(*conn, "customers") == 0);

  auto row = conn->execute("SELECT name FROM customers WHERE id = 'srv-1'", {});
  REQUIRE(row.rows.size() == 1);

  auto meta = conn->execute(
    "SELECT COUNT(*), entityId, status FROM _salve_sync_metadata WHERE tableName = 'customers'", {});
  REQUIRE(std::get<double>(meta.rows[0][0]) == 1.0);
  REQUIRE(std::get<std::string>(meta.rows[0][1]) == "srv-1");
  REQUIRE(std::get<std::string>(meta.rows[0][2]) == "SYNCED");
}

TEST_CASE("editing a row already synced pushes a PATCH to the server id, not the original local id", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_update_uses_server_id");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});

  respondByRoute(nullptr,
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{201, {}, R"({"id":"srv-1","name":"alice","updatedAt":100})"}; },
    nullptr, nullptr
  );
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  conn->execute("UPDATE customers SET name = 'alice-v2', updatedAt = 200 WHERE id = 'srv-1'", {});

  HttpRequest captured;
  respondByRoute(nullptr, nullptr,
    [&](const HttpRequest& request) -> HttpOutcome { captured = request; return HttpResponse{200, {}, *request.body}; },
    nullptr
  );
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE(captured.method == HttpMethod::Patch);
  REQUIRE(captured.url == "https://api.company.com/customers/srv-1");
}

TEST_CASE("a soft local delete on an already-synced row pushes DELETE, not PATCH", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_delete_uses_verb");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});

  respondByRoute(nullptr,
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{201, {}, R"({"id":"srv-1","name":"alice","updatedAt":100})"}; },
    nullptr, nullptr
  );
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  conn->execute("UPDATE customers SET deletedAt = 200 WHERE id = 'srv-1'", {}); // soft delete via the public delete path

  bool patchCalled = false;
  HttpRequest captured;
  respondByRoute(nullptr, nullptr,
    [&](const HttpRequest&) -> HttpOutcome { patchCalled = true; return HttpResponse{200, {}, "{}"}; },
    [&](const HttpRequest& request) -> HttpOutcome { captured = request; return HttpResponse{204, {}, ""}; }
  );
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE_FALSE(patchCalled);
  REQUIRE(captured.method == HttpMethod::Delete);
  REQUIRE(captured.url == "https://api.company.com/customers/srv-1");

  auto meta = conn->execute("SELECT status, syncedAt FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = 'temp-1'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "DELETED");
  REQUIRE(std::get<double>(meta.rows[0][1]) != 0.0);
}

TEST_CASE("a DELETE that gets a 404 is treated as an idempotent success (L2)", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_delete_404");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});

  respondByRoute(nullptr,
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{201, {}, R"({"id":"srv-1","name":"alice","updatedAt":100})"}; },
    nullptr, nullptr
  );
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  conn->execute("UPDATE customers SET deletedAt = 200 WHERE id = 'srv-1'", {});

  respondByRoute(nullptr, nullptr, nullptr,
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{404, {}, ""}; }
  );
  auto result = SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE(result->deleted == 1.0);
  REQUIRE(syncQueueCount(*conn, "customers") == 0);

  auto meta = conn->execute("SELECT status, syncedAt FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = 'temp-1'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "DELETED");
  REQUIRE(std::get<double>(meta.rows[0][1]) != 0.0);
}

TEST_CASE("a PATCH that gets a 404 stops retrying and blocks the item instead of failing forever (L2)", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_patch_404");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});

  respondByRoute(nullptr,
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{201, {}, R"({"id":"srv-1","name":"alice","updatedAt":100})"}; },
    nullptr, nullptr
  );
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  conn->execute("UPDATE customers SET name = 'alice-v2', updatedAt = 300 WHERE id = 'srv-1'", {});

  int patchCalls = 0;
  respondByRoute(nullptr, nullptr,
    [&](const HttpRequest&) -> HttpOutcome { ++patchCalls; return HttpResponse{404, {}, ""}; },
    nullptr
  );
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  auto queueRow = conn->execute("SELECT status FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(queueRow.rows.size() == 1);
  REQUIRE(std::get<std::string>(queueRow.rows[0][0]) == "BLOCKED");

  // A blocked item is excluded from readPending — a later session must not retry it.
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);
  REQUIRE(patchCalls == 1);
}

TEST_CASE("a POST response whose id already belongs to another synced row blocks the item instead of crashing the session or duplicating the POST", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_identity_collision");

  respondByRoute(
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{200, {}, R"([{"id":"2","name":"existing","updatedAt":100}])"}; },
    nullptr, nullptr, nullptr
  );
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false); // seeds an already-synced row under id "2"

  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'bob', 200)", {});

  int createCalls = 0;
  respondByRoute(
    [](const HttpRequest&) -> HttpOutcome { return emptyList(); },
    [&](const HttpRequest&) -> HttpOutcome {
      ++createCalls;
      return HttpResponse{201, {}, R"({"id":"2","name":"bob","updatedAt":200})"}; // collides with the row seeded above
    },
    nullptr, nullptr
  );

  REQUIRE_NOTHROW(SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false));
  REQUIRE(createCalls == 1);

  auto queueRow = conn->execute("SELECT status FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(queueRow.rows.size() == 1);
  REQUIRE(std::get<std::string>(queueRow.rows[0][0]) == "BLOCKED");

  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);
  REQUIRE(createCalls == 1); // blocked item was never retried, so never re-POSTed a duplicate
}

TEST_CASE("a POST that succeeds with an empty body fails instead of inventing a remoteId (L3)", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_create_empty_body");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});

  int creates = 0;
  respondByRoute(nullptr,
    [&](const HttpRequest&) -> HttpOutcome { ++creates; return HttpResponse{201, {}, ""}; },
    nullptr, nullptr
  );
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  auto queueRow = conn->execute("SELECT status FROM sync_queue WHERE entity = 'customers'", {});
  REQUIRE(queueRow.rows.size() == 1);
  REQUIRE(std::get<std::string>(queueRow.rows[0][0]) == "FAILED");

  auto meta = conn->execute("SELECT status, remoteId FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = 'temp-1'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "FAILED");
  REQUIRE(std::holds_alternative<margelo::nitro::NullType>(meta.rows[0][1])); // no remoteId was invented

  // Next session must still POST (create), not PATCH a fabricated id.
  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);
  REQUIRE(creates == 2);
}

TEST_CASE("a row created and deleted locally before ever syncing still gets syncedAt stamped (L8)", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_never_synced_delete");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  conn->execute("UPDATE customers SET deletedAt = 200 WHERE id = 'temp-1'", {});

  bool deleteCalled = false;
  respondByRoute(nullptr, nullptr, nullptr,
    [&](const HttpRequest&) -> HttpOutcome { deleteCalled = true; return HttpResponse{204, {}, ""}; }
  );

  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE_FALSE(deleteCalled); // never reached the server — nothing to DELETE
  REQUIRE(syncQueueCount(*conn, "customers") == 0);

  auto meta = conn->execute("SELECT status, syncedAt FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = 'temp-1'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "DELETED");
  REQUIRE(std::get<double>(meta.rows[0][1]) != 0.0);
}

TEST_CASE("create then edit before any sync: one session pushes POST then PATCH on the server id", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_create_then_edit_same_session");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});
  conn->execute("UPDATE customers SET name = 'alice-v2', updatedAt = 200 WHERE id = 'temp-1'", {});

  std::vector<std::string> methods;
  std::vector<std::string> urls;
  respondByRoute(nullptr,
    [&](const HttpRequest& request) -> HttpOutcome {
      methods.push_back("POST"); urls.push_back(request.url);
      // A real server echoes back what was sent (here, already "alice-v2" —
      // hydrateEntityBody reads the live row, not a stale queue snapshot).
      auto body = json::parse(*request.body).asObject();
      body["id"] = json::Value(std::string("srv-1"));
      return HttpResponse{201, {}, json::stringify(json::Value(body))};
    },
    [&](const HttpRequest& request) -> HttpOutcome {
      methods.push_back("PATCH"); urls.push_back(request.url);
      return HttpResponse{200, {}, *request.body};
    },
    nullptr
  );

  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE(methods.size() == 2);
  REQUIRE(methods[0] == "POST");
  REQUIRE(methods[1] == "PATCH");
  REQUIRE(urls[1] == "https://api.company.com/customers/srv-1"); // not temp-1

  auto row = conn->execute("SELECT name FROM customers WHERE id = 'srv-1'", {});
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "alice-v2");
  REQUIRE(syncQueueCount(*conn, "customers") == 0);
}

TEST_CASE("a row created and pulled back in the same session converges without duplicating", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_pull_converge");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});

  respondByRoute(
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{200, {}, R"([{"id":"srv-1","name":"alice","updatedAt":100}])"}; },
    [](const HttpRequest&) -> HttpOutcome { return HttpResponse{201, {}, R"({"id":"srv-1","name":"alice","updatedAt":100})"}; },
    nullptr, nullptr
  );

  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  auto rows = conn->execute("SELECT COUNT(*) FROM customers WHERE id = 'srv-1'", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 1.0);

  auto meta = conn->execute("SELECT COUNT(*) FROM _salve_sync_metadata WHERE tableName = 'customers'", {});
  REQUIRE(std::get<double>(meta.rows[0][0]) == 1.0);
}

TEST_CASE("push respects a cap on items per session, leaving the rest PENDING, and still runs the pull", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_push_item_cap");
  for (int i = 0; i < 201; ++i) {
    conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES (?, 'a', 100)", { std::to_string(i) });
  }

  int creates = 0;
  bool listCalled = false;
  respondByRoute(
    [&](const HttpRequest&) -> HttpOutcome { listCalled = true; return emptyList(); },
    [&](const HttpRequest& request) -> HttpOutcome { ++creates; return HttpResponse{201, {}, *request.body}; },
    nullptr, nullptr
  );

  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE(creates == 200); // kMaxPushItemsPerSession
  REQUIRE(syncQueueCount(*conn, "customers") == 1);
  REQUIRE(listCalled); // the cap is not a network abort — pull still runs
}

// ── Migration: pre-#84 cursor is reset, not misread ─────────────────────────

TEST_CASE("a pre-#84 opaque cursor is reset on registration; the first pull starts from since=0", "[sync][SyncOrchestrator]") {
  resetSecureStore();
  DatabaseManager::shared().open(uniqueDbName("orchestrator_cursor_migration"));
  auto conn = DatabaseManager::shared().connection();

  // Simulate a pre-#84 install: the cursors table already exists and holds
  // an opaque server cursor, from before any registerSchema() under #84 ran.
  conn->execute("CREATE TABLE IF NOT EXISTS _salve_sync_cursors (entity TEXT PRIMARY KEY, cursor TEXT NOT NULL)", {});
  conn->execute("INSERT OR REPLACE INTO _salve_sync_cursors (entity, cursor) VALUES ('customers', '\"opaque-server-cursor\"')", {});

  MigrationEngine(conn).registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "name": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": {
      "enabled": true,
      "endpoint": { "basePath": "/customers", "sinceParam": "updatedAfter", "limitParam": "limit" }
    }
  })"));

  DatabaseManager::shared().configureCredentials(
    "oauth2", "Authorization", "/auth/refresh", "$.accessToken", "$.refreshToken",
    InitialCredentialTokens{"access-1", "refresh-1"}
  );
  DatabaseManager::shared().configureNetwork("https://api.company.com", 5000.0);

  HttpRequest captured;
  respondByRoute(
    [&](const HttpRequest& request) -> HttpOutcome { captured = request; return emptyList(); },
    nullptr, nullptr, nullptr
  );

  SyncOrchestrator().triggerSync("customers", /*discardIfBusy*/ false);

  REQUIRE(captured.url.find("updatedAfter=0") != std::string::npos);
}
