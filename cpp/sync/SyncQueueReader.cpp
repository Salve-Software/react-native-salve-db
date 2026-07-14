#include "SyncQueueReader.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

namespace {

// `offset` accounts for readPage's leading `id` column (offset 1) vs.
// readOperations, which doesn't select it (offset 0).
template <typename Row>
json::Object operationFromRow(const Row& row, size_t offset) {
  json::Object op;
  op["operation"]  = json::Value(std::get<std::string>(row[offset + 0]));
  op["entity"]     = json::Value(std::get<std::string>(row[offset + 1]));
  op["primaryKey"] = json::Value(std::get<std::string>(row[offset + 2]));
  op["payload"]    = json::parse(std::get<std::string>(row[offset + 3]));
  op["updatedAt"]  = json::Value(std::get<double>(row[offset + 4]));
  return op;
}

} // namespace

SyncQueueReader::SyncQueueReader(std::shared_ptr<SQLiteConnection> conn)
  : _conn(std::move(conn)) {}

json::Array SyncQueueReader::readOperations(int limit) {
  if (limit < 0) {
    throw std::runtime_error("SyncQueueReader: limit must be >= 0, got " + std::to_string(limit));
  }

  auto result = _conn->execute(
    "SELECT operation, entity, entity_id, payload, updated_at "
    "FROM sync_queue ORDER BY id ASC LIMIT ?",
    { static_cast<double>(limit) }
  );

  json::Array operations;
  operations.reserve(result.rows.size());
  for (const auto& row : result.rows) {
    operations.emplace_back(operationFromRow(row, 0));
  }

  return operations;
}

SyncQueueStatus SyncQueueReader::getStatus(const std::string& entity) {
  auto result = _conn->execute(
    "SELECT COUNT(*), MIN(updated_at) FROM sync_queue WHERE entity = ?",
    { entity }
  );

  double pendingCount = std::get<double>(result.rows[0][0]);
  std::optional<double> oldestPendingUpdatedAt;
  if (pendingCount > 0 && std::holds_alternative<double>(result.rows[0][1])) {
    oldestPendingUpdatedAt = std::get<double>(result.rows[0][1]);
  }

  return SyncQueueStatus(pendingCount, oldestPendingUpdatedAt);
}

SyncQueuePage SyncQueueReader::readPage(const std::string& entity, int limit) {
  if (limit < 0) {
    throw std::runtime_error("SyncQueueReader: limit must be >= 0, got " + std::to_string(limit));
  }

  auto result = _conn->execute(
    "SELECT id, operation, entity, entity_id, payload, updated_at "
    "FROM sync_queue WHERE entity = ? ORDER BY id ASC LIMIT ?",
    { entity, static_cast<double>(limit) }
  );

  SyncQueuePage page;
  page.operations.reserve(result.rows.size());
  for (const auto& row : result.rows) {
    // ORDER BY id ASC, so the last row iterated is always the highest id.
    page.maxId = static_cast<int64_t>(std::get<double>(row[0]));
    page.operations.emplace_back(operationFromRow(row, 1));
  }

  return page;
}

} // namespace margelo::nitro::salvedb
