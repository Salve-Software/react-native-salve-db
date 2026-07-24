#include <catch2/catch_test_macros.hpp>
#include "../../database/DatabaseManager.hpp"
#include "../../database/MigrationEngine.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/SyncCursorStore.hpp"
#include "../../sync/SyncOrchestrator.hpp"
#include "../support/platform_test.hpp"
#include <atomic>
#include <chrono>
#include <thread>
#include <vector>

using namespace margelo::nitro::salvedb;

namespace {

std::string uniqueDbName(const std::string& testName) {
  static int counter = 0;
  return testName + "_" + std::to_string(++counter);
}

void resetSecureStore() {
  platform::deleteSecureValue("salvedb.credentials.accessToken");
  platform::deleteSecureValue("salvedb.credentials.refreshToken");
}

// Opens a fresh DatabaseManager-backed fixture: a "customers" schema with
// sync.enabled, seeded credentials (access-1/refresh-1) and network config —
// SyncOrchestrator pulls all of this from DatabaseManager::shared() itself,
// so tests must go through it rather than a locally-constructed connection.
std::shared_ptr<SQLiteConnection> openOrchestratorFixture(
  const std::string& testName, double pageSize = 20, int maxPagesPerSession = 20
) {
  resetSecureStore();

  DatabaseManager::shared().open(uniqueDbName(testName));
  MigrationEngine engine(DatabaseManager::shared().connection());
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "name": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": {
      "enabled": true,
      "endpoint": { "method": "POST", "path": "/sync/customers" },
      "pagination": { "pageSize": )" + std::to_string(pageSize) + R"(, "maxPagesPerSession": )" + std::to_string(maxPagesPerSession) + R"( },
      "request": { "body": {
        "cursor": { "$ref": "cursor" },
        "operations": { "$ref": "operations" },
        "pageSize": { "$ref": "pageSize" }
      } },
      "response": { "cursor": "$.cursor", "operations": "$.operations", "ack": "$.ack", "hasMore": "$.hasMore" }
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

} // namespace

TEST_CASE("triggerSync runs a full cycle: reads queue, sends, applies response, updates cursor, clears queue", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_full_cycle");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('local1', 'a', 100)", {});

  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{200, {}, R"({
      "cursor": "c1", "hasMore": false,
      "operations": [
        { "operation": "insert", "entity": "customers", "primaryKey": "srv1",
          "payload": { "id": "srv1", "name": "server-row", "updatedAt": 500 }, "updatedAt": 500 }
      ]
    })"};
  });

  SyncOrchestrator orchestrator;
  auto result = orchestrator.triggerSync("customers");

  REQUIRE(result.operationsApplied == 1.0);
  REQUIRE(result.inserted == 1.0);
  REQUIRE(result.cursor.has_value());

  REQUIRE(syncQueueCount(*conn, "customers") == 0);
  auto rows = conn->execute("SELECT COUNT(*) FROM customers", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 2.0); // local1 (pushed) + srv1 (applied)

  SyncCursorStore cursorStore(conn);
  REQUIRE(cursorStore.load("customers").value() == "\"c1\"");
}

TEST_CASE("triggerSync drains a queue larger than pageSize across multiple pages in one session", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_multi_page", /*pageSize*/ 1, /*maxPagesPerSession*/ 20);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('2', 'b', 100)", {});
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('3', 'c', 100)", {});

  int calls = 0;
  platform::test::setHttpExecuteResult([&](const HttpRequest&) -> HttpOutcome {
    ++calls;
    bool more = calls < 3;
    return HttpResponse{200, {}, R"({"cursor": "c)" + std::to_string(calls) + R"(", "hasMore": )" + (more ? "true" : "false") + R"(, "operations": []})"};
  });

  SyncOrchestrator().triggerSync("customers");

  REQUIRE(calls == 3);
  REQUIRE(syncQueueCount(*conn, "customers") == 0);
}

TEST_CASE("triggerSync stops at maxPagesPerSession and a later call resumes from the persisted cursor", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_page_cutoff", /*pageSize*/ 1, /*maxPagesPerSession*/ 2);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('2', 'b', 100)", {});
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('3', 'c', 100)", {});

  int calls = 0;
  platform::test::setHttpExecuteResult([&](const HttpRequest&) -> HttpOutcome {
    ++calls;
    // Always reports more pending, to prove the session stops on its own cap.
    return HttpResponse{200, {}, R"({"cursor": "c)" + std::to_string(calls) + R"(", "hasMore": true, "operations": []})"};
  });

  SyncOrchestrator orchestrator;
  auto first = orchestrator.triggerSync("customers");

  REQUIRE(calls == 2); // capped at maxPagesPerSession, no error
  REQUIRE(syncQueueCount(*conn, "customers") == 1); // 2 of 3 rows drained
  REQUIRE(first.cursor.value() == "c2");

  auto second = orchestrator.triggerSync("customers");

  REQUIRE(calls == 4); // resumed with 2 more calls
  REQUIRE(syncQueueCount(*conn, "customers") == 0); // remaining row drained on resume
  REQUIRE(second.cursor.value() == "c4");
}

// Real ~10s: 2 real 5s retry delays — no test-only override, to keep that
// hardcoded delay out of the production binary (see PR #61 review).
TEST_CASE("triggerSync retries a network failure 3 times before giving up, without advancing the cursor", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_retry_exhausted");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});

  int calls = 0;
  platform::test::setHttpExecuteResult([&](const HttpRequest&) -> HttpOutcome {
    ++calls;
    return HttpNetworkError{HttpNetworkErrorKind::NoConnection, "no connection"};
  });

  SyncOrchestrator orchestrator;
  REQUIRE_THROWS_AS(orchestrator.triggerSync("customers"), std::runtime_error);

  REQUIRE(calls == 3);
  REQUIRE(syncQueueCount(*conn, "customers") == 1); // nothing committed
  SyncCursorStore cursorStore(conn);
  REQUIRE_FALSE(cursorStore.load("customers").has_value());
}

TEST_CASE("triggerSync refreshes the token on 401 and reexecutes the page", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_401_refresh");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});

  platform::test::setHttpExecuteResult([](const HttpRequest& request) -> HttpOutcome {
    if (request.url.find("/auth/refresh") != std::string::npos) {
      return HttpResponse{200, {}, R"({"accessToken": "access-2", "refreshToken": "refresh-2"})"};
    }
    std::string authHeader;
    for (auto& [name, value] : request.headers) {
      if (name == "Authorization") authHeader = value;
    }
    if (authHeader == "access-1") {
      return HttpResponse{401, {}, "{}"};
    }
    return HttpResponse{200, {}, R"({"cursor": "c1", "hasMore": false, "operations": []})"};
  });

  SyncOrchestrator orchestrator;
  auto result = orchestrator.triggerSync("customers");

  REQUIRE(result.cursor.value() == "c1");
  REQUIRE(DatabaseManager::shared().credentials().getAccessToken().value() == "access-2");
  REQUIRE(syncQueueCount(*conn, "customers") == 0);
}

// Real ~10s — see the retry-exhaustion test above for why there's no override.
TEST_CASE("a 401 refresh does not eat into the retry budget for a subsequent network failure", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_401_then_network_failure");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});

  int networkAttempts = 0;
  platform::test::setHttpExecuteResult([&](const HttpRequest& request) -> HttpOutcome {
    if (request.url.find("/auth/refresh") != std::string::npos) {
      return HttpResponse{200, {}, R"({"accessToken": "access-2", "refreshToken": "refresh-2"})"};
    }
    std::string authHeader;
    for (auto& [name, value] : request.headers) {
      if (name == "Authorization") authHeader = value;
    }
    if (authHeader == "access-1") {
      return HttpResponse{401, {}, "{}"};
    }
    ++networkAttempts;
    return HttpNetworkError{HttpNetworkErrorKind::NoConnection, "no connection"};
  });

  SyncOrchestrator orchestrator;
  REQUIRE_THROWS_AS(orchestrator.triggerSync("customers"), std::runtime_error);

  REQUIRE(networkAttempts == 3); // full retry budget preserved even though a 401 refresh happened first
}

TEST_CASE("an operation applied from the server does not get re-queued into sync_queue", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_no_reentry");

  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{200, {}, R"({
      "cursor": "c1", "hasMore": false,
      "operations": [
        { "operation": "insert", "entity": "customers", "primaryKey": "srv1",
          "payload": { "id": "srv1", "name": "from-server", "updatedAt": 100 }, "updatedAt": 100 }
      ]
    })"};
  });

  SyncOrchestrator().triggerSync("customers");

  REQUIRE(syncQueueCount(*conn, "customers") == 0);
}

TEST_CASE("an error mid-apply rolls back the whole page: no partial writes, lock cleared, cursor untouched", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_apply_rollback");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});

  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{200, {}, R"({
      "cursor": "c1", "hasMore": false,
      "operations": [
        { "operation": "insert", "entity": "customers", "primaryKey": "srv1",
          "payload": { "id": "srv1", "name": "should-roll-back", "updatedAt": 500 }, "updatedAt": 500 },
        { "operation": "insert", "entity": "no_such_table", "primaryKey": "x",
          "payload": { "id": "x" }, "updatedAt": 500 }
      ]
    })"};
  });

  SyncOrchestrator orchestrator;
  REQUIRE_THROWS(orchestrator.triggerSync("customers"));

  auto srv1 = conn->execute("SELECT COUNT(*) FROM customers WHERE id = 'srv1'", {});
  REQUIRE(std::get<double>(srv1.rows[0][0]) == 0.0); // rolled back, not partially applied

  auto lockRows = conn->execute("SELECT COUNT(*) FROM _sync_apply_lock", {});
  REQUIRE(std::get<double>(lockRows.rows[0][0]) == 0.0);

  REQUIRE(syncQueueCount(*conn, "customers") == 1); // the pushed row was never cleared
  SyncCursorStore cursorStore(conn);
  REQUIRE_FALSE(cursorStore.load("customers").has_value());
}

TEST_CASE("DatabaseManager::tryLockSync fails while another thread holds lockSync", "[sync][SyncOrchestrator][concurrency]") {
  openOrchestratorFixture("orchestrator_lock_contention");

  auto held = DatabaseManager::shared().lockSync();
  REQUIRE(held.owns_lock());

  auto contended = DatabaseManager::shared().tryLockSync();
  REQUIRE_FALSE(contended.owns_lock());
}

TEST_CASE("concurrent triggerSync calls are serialized instead of racing into a nested transaction", "[sync][SyncOrchestrator][concurrency]") {
  auto conn = openOrchestratorFixture("orchestrator_concurrent_sessions");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});

  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    std::this_thread::sleep_for(std::chrono::milliseconds(50));
    return HttpResponse{200, {}, R"({"cursor": "c1", "hasMore": false, "operations": []})"};
  });

  std::atomic<int> errors{0};
  std::vector<std::thread> threads;
  for (int i = 0; i < 4; ++i) {
    threads.emplace_back([&errors]() {
      try {
        SyncOrchestrator().triggerSync("customers");
      } catch (const std::exception&) {
        ++errors;
      }
    });
  }
  for (auto& th : threads) th.join();

  // Before the sync-session mutex, this reliably threw "Nested transactions
  // are not supported" — SyncApplyGuard::applyWithBypass opens a real
  // transaction per page, and four sessions raced into it concurrently.
  REQUIRE(errors == 0);
}

TEST_CASE("triggerSyncAll runs every enabled schema, isolating one schema's failure from the rest", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_all_isolation");
  MigrationEngine engine(conn);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "orders", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "text" }, "updatedAt": { "type": "datetime", "nullable": false } },
    "sync": {
      "enabled": true,
      "endpoint": { "method": "POST", "path": "/sync/orders" },
      "request": { "body": {
        "cursor": { "$ref": "cursor" },
        "operations": { "$ref": "operations" },
        "pageSize": { "$ref": "pageSize" }
      } },
      "response": { "cursor": "$.cursor", "operations": "$.operations", "hasMore": "$.hasMore" }
    }
  })"));

  platform::test::setHttpExecuteResult([](const HttpRequest& request) -> HttpOutcome {
    if (request.url.find("/sync/customers") != std::string::npos) {
      return HttpResponse{500, {}, "boom"};
    }
    return HttpResponse{200, {}, R"({"cursor": "c1", "hasMore": false, "operations": []})"};
  });

  auto results = SyncOrchestrator().triggerSyncAll(/*discardIfBusy*/ false);

  REQUIRE(results.size() == 1); // "customers" failed and was skipped; "orders" still ran
  REQUIRE(results[0].cursor.value() == "c1");

  SyncCursorStore cursorStore(conn);
  REQUIRE_FALSE(cursorStore.load("customers").has_value()); // failed schema never advanced
  REQUIRE(cursorStore.load("orders").has_value());
}

TEST_CASE("triggerSyncAll discards silently when a sync session is already in progress", "[sync][SyncOrchestrator][concurrency]") {
  openOrchestratorFixture("orchestrator_all_discard");

  auto held = DatabaseManager::shared().lockSync();

  auto results = SyncOrchestrator().triggerSyncAll(/*discardIfBusy*/ true);

  REQUIRE(results.empty());
}

TEST_CASE("triggerSync applies a Replace Transaction ack: id rewritten, metadata SYNCED, no duplication", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_ack_replace");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});

  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{200, {}, R"({
      "cursor": "c1", "hasMore": false, "operations": [],
      "ack": [
        { "localId": "temp-1", "id": "srv-1", "name": "alice", "updatedAt": 100 }
      ]
    })"};
  });

  SyncOrchestrator orchestrator;
  auto result = orchestrator.triggerSync("customers");

  REQUIRE(result.updated == 1.0);
  REQUIRE(syncQueueCount(*conn, "customers") == 0);

  auto row = conn->execute("SELECT name FROM customers WHERE id = 'srv-1'", {});
  REQUIRE(row.rows.size() == 1);
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "alice");

  auto meta = conn->execute(
    "SELECT COUNT(*), entityId, status FROM _salve_sync_metadata WHERE tableName = 'customers'", {});
  REQUIRE(std::get<double>(meta.rows[0][0]) == 1.0);
  REQUIRE(std::get<std::string>(meta.rows[0][1]) == "srv-1");
  REQUIRE(std::get<std::string>(meta.rows[0][2]) == "SYNCED");
}

TEST_CASE("triggerSync applies acks across multiple pages", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_ack_pagination", /*pageSize*/ 1, /*maxPagesPerSession*/ 20);
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'a', 100)", {});
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-2', 'b', 100)", {});

  int calls = 0;
  platform::test::setHttpExecuteResult([&](const HttpRequest&) -> HttpOutcome {
    ++calls;
    std::string localId = "temp-" + std::to_string(calls);
    std::string serverId = "srv-" + std::to_string(calls);
    bool more = calls < 2;
    return HttpResponse{200, {}, R"({"cursor": "c)" + std::to_string(calls) + R"(", "hasMore": )" + (more ? "true" : "false") +
      R"(, "operations": [], "ack": [{ "localId": ")" + localId + R"(", "id": ")" + serverId + R"(", "updatedAt": 100 }]})"};
  });

  SyncOrchestrator().triggerSync("customers");

  REQUIRE(calls == 2);
  REQUIRE(syncQueueCount(*conn, "customers") == 0);

  auto srv1 = conn->execute("SELECT COUNT(*) FROM customers WHERE id = 'srv-1'", {});
  REQUIRE(std::get<double>(srv1.rows[0][0]) == 1.0);
  auto srv2 = conn->execute("SELECT COUNT(*) FROM customers WHERE id = 'srv-2'", {});
  REQUIRE(std::get<double>(srv2.rows[0][0]) == 1.0);
}

TEST_CASE("triggerSync applies a soft-delete ack without erroring", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_ack_soft_delete");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('1', 'a', 100)", {});
  conn->execute("DELETE FROM customers WHERE id = '1'", {});

  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{200, {}, R"({
      "cursor": "c1", "hasMore": false, "operations": [],
      "ack": [ { "localId": "1" } ]
    })"};
  });

  SyncOrchestrator orchestrator;
  REQUIRE_NOTHROW(orchestrator.triggerSync("customers"));

  auto meta = conn->execute(
    "SELECT status, syncedAt FROM _salve_sync_metadata WHERE tableName = 'customers' AND localId = '1'", {});
  REQUIRE(std::get<std::string>(meta.rows[0][0]) == "DELETED");
  REQUIRE(std::get<double>(meta.rows[0][1]) != 0.0);
}

TEST_CASE("triggerSync applies an ack before a pulled operation targeting the same resulting row", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_ack_and_operation_same_row");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});

  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{200, {}, R"({
      "cursor": "c1", "hasMore": false,
      "ack": [
        { "localId": "temp-1", "id": "srv-1", "name": "alice", "updatedAt": 100 }
      ],
      "operations": [
        { "operation": "update", "entity": "customers", "primaryKey": "srv-1",
          "payload": { "id": "srv-1", "name": "alice-v2", "updatedAt": 200 }, "updatedAt": 200 }
      ]
    })"};
  });

  SyncOrchestrator orchestrator;
  REQUIRE_NOTHROW(orchestrator.triggerSync("customers"));

  // If the pulled operation ran before the ack, it would INSERT id='srv-1'
  // ahead of the ack's UPDATE ... SET id='srv-1', colliding on the PK and
  // rolling back the whole page. Processing the ack first avoids that.
  auto rows = conn->execute("SELECT COUNT(*) FROM customers WHERE id = 'srv-1'", {});
  REQUIRE(std::get<double>(rows.rows[0][0]) == 1.0);

  auto row = conn->execute("SELECT name FROM customers WHERE id = 'srv-1'", {});
  REQUIRE(std::get<std::string>(row.rows[0][0]) == "alice-v2");
}

TEST_CASE("triggerSync's ack replace does not re-enqueue into sync_queue via the apply lock", "[sync][SyncOrchestrator]") {
  auto conn = openOrchestratorFixture("orchestrator_ack_no_reentry");
  conn->execute("INSERT INTO customers (id, name, updatedAt) VALUES ('temp-1', 'alice', 100)", {});

  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{200, {}, R"({
      "cursor": "c1", "hasMore": false, "operations": [],
      "ack": [ { "localId": "temp-1", "id": "srv-1", "name": "alice", "updatedAt": 100 } ]
    })"};
  });

  SyncOrchestrator().triggerSync("customers");

  REQUIRE(syncQueueCount(*conn, "customers") == 0);

  auto pending = conn->execute(
    "SELECT COUNT(*) FROM _salve_sync_metadata WHERE tableName = 'customers' AND status = 'PENDING'", {});
  REQUIRE(std::get<double>(pending.rows[0][0]) == 0.0);
}
