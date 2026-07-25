#include "SyncPushPhase.hpp"
#include "../database/SalveMetadataManager.hpp"
#include <NitroModules/Null.hpp>
#include <chrono>
#include <optional>
#include <stdexcept>
#include <variant>

namespace margelo::nitro::salvedb {

namespace {

// Symmetric with maxPagesPerSession: bounds how long one background wake can
// hold the sync lock. See docs/sync-rest-contract.md's open question on this.
constexpr int kMaxPushItemsPerSession = 200;

int64_t nowMillis() {
  return static_cast<int64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::system_clock::now().time_since_epoch()).count());
}

json::Value sqlValueToJson(const SqlValue& v) {
  if (std::holds_alternative<nitro::NullType>(v)) return json::Value(nullptr);
  if (std::holds_alternative<bool>(v)) return json::Value(std::get<bool>(v));
  if (std::holds_alternative<double>(v)) return json::Value(std::get<double>(v));
  if (std::holds_alternative<std::string>(v)) return json::Value(std::get<std::string>(v));
  throw std::runtime_error("SyncPushPhase: blob columns are not supported in a sync push body");
}

std::string primaryKeyColumn(SQLiteConnection& conn, const std::string& entity) {
  auto result = conn.execute("PRAGMA table_info(\"" + entity + "\")", {});
  for (auto& row : result.rows) {
    if (std::get<double>(row[5]) != 0) return std::get<std::string>(row[1]);
  }
  throw std::runtime_error("SyncPushPhase: no primary key found for table '" + entity + "'");
}

struct RowSnapshot {
  bool exists = false;
  bool tombstoned = false;
  json::Value body{nullptr};
};

// Single read backing both the tombstone check and the request body — the
// row's `deletedAt` and every other column come from the same query instead
// of two separate round-trips per item.
RowSnapshot readRowSnapshot(SQLiteConnection& conn, const std::string& entity,
                             const std::string& pkCol, const std::string& id) {
  auto result = conn.execute("SELECT * FROM \"" + entity + "\" WHERE \"" + pkCol + "\" = ?", { id });
  RowSnapshot snapshot;
  if (result.rows.empty()) return snapshot;
  snapshot.exists = true;

  json::Object body;
  for (size_t i = 0; i < result.columns.size(); ++i) {
    const std::string& col = result.columns[i];
    if (col == "deletedAt") {
      snapshot.tombstoned = !std::holds_alternative<nitro::NullType>(result.rows[0][i]);
      continue;
    }
    if (col == pkCol) continue;
    body[col] = sqlValueToJson(result.rows[0][i]);
  }
  snapshot.body = json::Value(std::move(body));
  return snapshot;
}

} // namespace

PushPhaseResult runPushPhase(const std::string& entity, const SyncContract& contract,
                              std::shared_ptr<SQLiteConnection> conn, SyncQueueStore& queue,
                              SyncOperationApplier& applier, SyncApplyGuard& guard,
                              SyncHttpRequester& requester) {
  PushPhaseResult result;
  std::string pkCol = primaryKeyColumn(*conn, entity);
  SalveMetadataManager metadata(conn);

  auto items = queue.readPending(entity, kMaxPushItemsPerSession);

  for (auto& item : items) {
    // Resolve the current server id fresh: an earlier item in this same
    // session may have already replaced this row, making readPending's
    // snapshot stale.
    std::optional<std::string> remoteId;
    if (item.localId.has_value()) {
      auto meta = metadata.getByLocalId(entity, *item.localId);
      if (meta) remoteId = meta->remoteId;
    }
    std::string localIdForApply = item.localId.value_or(item.queuedEntityId);
    std::string currentId = remoteId.value_or(item.queuedEntityId);

    bool isDelete = item.operation == "delete";
    std::optional<json::Value> body;

    if (!isDelete) {
      RowSnapshot snapshot = readRowSnapshot(*conn, entity, pkCol, currentId);
      if (snapshot.tombstoned) {
        isDelete = true;
      } else if (snapshot.exists) {
        body = std::move(snapshot.body);
      }
    }

    if (isDelete && !remoteId.has_value()) {
      // Never reached the server — nothing to delete there, and never will
      // be. Still confirm locally so metadata gets a syncedAt stamp even
      // though no HTTP call ever went out (L8).
      guard.applyWithBypass([&] {
        applier.confirmDeleted(entity, localIdForApply);
        queue.remove(item.id);
      });
      continue;
    }

    if (!isDelete && !body) {
      // Created and deleted offline before any sync — nothing left to push.
      queue.remove(item.id);
      continue;
    }

    SyncHttpOutcome outcome = isDelete
      ? requester.remove(contract.endpoint, currentId)
      : (remoteId.has_value()
          ? requester.update(contract.endpoint, currentId, *body)
          : requester.create(contract.endpoint, *body));

    if (auto* error = std::get_if<HttpNetworkError>(&outcome)) {
      result.abortedByNetwork = true;
      result.networkError = error->message;
      break;
    }

    auto& response = std::get<SyncHttpResponse>(outcome);
    bool isSuccess = response.statusCode >= 200 && response.statusCode < 300;

    if (!isSuccess) {
      if (isDelete && response.statusCode == 404) {
        // Idempotent: the row is already gone server-side either way.
        guard.applyWithBypass([&] {
          applier.confirmDeleted(entity, localIdForApply);
          result.deleted++;
          queue.remove(item.id);
        });
        continue;
      }
      if (!isDelete && response.statusCode == 404) {
        // Ambiguous — the target vanished server-side while a local edit is
        // pending. Recreating via POST or dropping the local row are both a
        // conflict-resolution call the MVP deliberately left out of scope —
        // stop auto-retrying and leave it for manual resolution instead.
        queue.markBlocked(item.id, "HTTP 404 — target no longer exists on the server");
        continue;
      }
      std::string error = "HTTP " + std::to_string(response.statusCode);
      queue.markFailed(item.id, error);
      metadata.markFailed(entity, localIdForApply, error, nowMillis());
      result.failed++;
      continue;
    }

    bool isCreate = !isDelete && !remoteId.has_value();
    if (isCreate && !response.body.isObject()) {
      // The server must echo the created entity so we learn its assigned id
      // — an empty 2xx body here would silently freeze remoteId at the local id.
      std::string error = "POST succeeded with an empty body — server must echo the created entity";
      queue.markFailed(item.id, error);
      metadata.markFailed(entity, localIdForApply, error, nowMillis());
      result.failed++;
      continue;
    }

    try {
      guard.applyWithBypass([&] {
        if (isDelete) {
          applier.confirmDeleted(entity, localIdForApply);
          result.deleted++;
          queue.remove(item.id);
          return;
        }

        auto identity = applier.recordRemoteSuccess(entity, localIdForApply, response.body);
        try {
          applier.rewriteLocalRow(entity, identity, response.body);
          result.replaced++;
          queue.remove(item.id);
        } catch (const std::exception& e) {
          // The server write is durably recorded above — a retry PATCHes the resolved id, never re-POSTs a duplicate. The local row itself needs a human, not another automatic attempt.
          queue.markBlocked(item.id, std::string("local apply failed after a successful server write: ") + e.what());
        }
      });
    } catch (const std::exception& e) {
      // Still past the "server already accepted this write" point (recordRemoteSuccess/confirmDeleted itself threw) — retrying as a fresh create/delete risks duplicating it server-side, same reasoning as the inner catch.
      queue.markBlocked(item.id, std::string("local apply failed after a successful server write: ") + e.what());
    }
  }

  return result;
}

} // namespace margelo::nitro::salvedb
