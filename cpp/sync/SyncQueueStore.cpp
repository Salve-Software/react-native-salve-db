#include "SyncQueueStore.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

SyncQueueStore::SyncQueueStore(std::shared_ptr<SQLiteConnection> conn)
  : _conn(std::move(conn)) {}

std::vector<SyncQueueItem> SyncQueueStore::readPending(const std::string& entity, int limit) {
  if (limit < 0) {
    throw std::runtime_error("SyncQueueStore: limit must be >= 0, got " + std::to_string(limit));
  }

  auto result = _conn->execute(
    "SELECT sq.id, sq.operation, sq.entity_id, sm.localId "
    "FROM sync_queue sq "
    "LEFT JOIN _salve_sync_metadata sm ON (sq.entity = sm.tableName AND sq.entity_id = sm.entityId) "
    "WHERE sq.entity = ? AND sq.status IN ('PENDING','FAILED') "
    "ORDER BY sq.id ASC LIMIT ?",
    { entity, static_cast<double>(limit) }
  );

  std::vector<SyncQueueItem> items;
  items.reserve(result.rows.size());
  for (const auto& row : result.rows) {
    SyncQueueItem item;
    item.id = static_cast<int64_t>(std::get<double>(row[0]));
    item.operation = std::get<std::string>(row[1]);
    item.queuedEntityId = std::get<std::string>(row[2]);
    if (std::holds_alternative<std::string>(row[3])) {
      item.localId = std::get<std::string>(row[3]);
    }
    items.push_back(std::move(item));
  }
  return items;
}

void SyncQueueStore::remove(int64_t id) {
  _conn->execute("DELETE FROM sync_queue WHERE id = ?", { static_cast<double>(id) });
}

void SyncQueueStore::markFailed(int64_t id, const std::string& error) {
  _conn->execute(
    "UPDATE sync_queue SET status = 'FAILED', retryCount = retryCount + 1, lastError = ? WHERE id = ?",
    { error, static_cast<double>(id) }
  );
}

void SyncQueueStore::markBlocked(int64_t id, const std::string& reason) {
  _conn->execute(
    "UPDATE sync_queue SET status = 'BLOCKED', retryCount = retryCount + 1, lastError = ? WHERE id = ?",
    { reason, static_cast<double>(id) }
  );
}

void SyncQueueStore::rewriteEntityId(const std::string& entity, const std::string& oldId, const std::string& newId) {
  _conn->execute(
    "UPDATE sync_queue SET entity_id = ? WHERE entity = ? AND entity_id = ?",
    { newId, entity, oldId }
  );
}

} // namespace margelo::nitro::salvedb
