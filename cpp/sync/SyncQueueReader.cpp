#include "SyncQueueReader.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

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
    json::Object op;
    op["operation"]  = json::Value(std::get<std::string>(row[0]));
    op["entity"]     = json::Value(std::get<std::string>(row[1]));
    op["primaryKey"] = json::Value(std::get<std::string>(row[2]));
    op["payload"]    = json::parse(std::get<std::string>(row[3]));
    op["updatedAt"]  = json::Value(std::get<double>(row[4]));
    operations.emplace_back(std::move(op));
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

} // namespace margelo::nitro::salvedb
