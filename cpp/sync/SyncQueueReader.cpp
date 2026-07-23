#include "SyncQueueReader.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

namespace {

// `offset` accounts for readPage's leading `id` column (offset 1) vs.
// readOperations, which doesn't select it (offset 0). metadataOffset points to localId/remoteId columns.
template <typename Row>
json::Object operationFromRow(const Row& row, size_t offset, size_t metadataOffset) {
  json::Object op;
  op["operation"]  = json::Value(std::get<std::string>(row[offset + 0]));
  op["entity"]     = json::Value(std::get<std::string>(row[offset + 1]));
  op["primaryKey"] = json::Value(std::get<std::string>(row[offset + 2]));
  op["payload"]    = json::parse(std::get<std::string>(row[offset + 3]));
  op["updatedAt"]  = json::Value(std::get<double>(row[offset + 4]));

  // Enrich with localId and remoteId from joined metadata.
  if (row.size() > metadataOffset) {
    const auto& localIdVal = row[metadataOffset];
    if (std::holds_alternative<std::string>(localIdVal)) {
      op["localId"] = json::Value(std::get<std::string>(localIdVal));
    }
  }
  if (row.size() > metadataOffset + 1) {
    const auto& remoteIdVal = row[metadataOffset + 1];
    if (std::holds_alternative<std::string>(remoteIdVal)) {
      const auto& val = std::get<std::string>(remoteIdVal);
      if (!val.empty()) {
        op["remoteId"] = json::Value(val);
      }
    }
  }

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
    "SELECT sq.operation, sq.entity, sq.entity_id, sq.payload, sq.updated_at, sm.localId, sm.remoteId "
    "FROM sync_queue sq "
    "LEFT JOIN _salve_sync_metadata sm ON (sq.entity = sm.tableName AND sq.entity_id = sm.localId) "
    "ORDER BY sq.id ASC LIMIT ?",
    { static_cast<double>(limit) }
  );

  json::Array operations;
  operations.reserve(result.rows.size());
  for (const auto& row : result.rows) {
    operations.emplace_back(operationFromRow(row, 0, 5));
  }

  return operations;
}

SyncQueuePage SyncQueueReader::readPage(const std::string& entity, int limit) {
  if (limit < 0) {
    throw std::runtime_error("SyncQueueReader: limit must be >= 0, got " + std::to_string(limit));
  }

  auto result = _conn->execute(
    "SELECT sq.id, sq.operation, sq.entity, sq.entity_id, sq.payload, sq.updated_at, sm.localId, sm.remoteId "
    "FROM sync_queue sq "
    "LEFT JOIN _salve_sync_metadata sm ON (sq.entity = sm.tableName AND sq.entity_id = sm.localId) "
    "WHERE sq.entity = ? ORDER BY sq.id ASC LIMIT ?",
    { entity, static_cast<double>(limit) }
  );

  SyncQueuePage page;
  page.operations.reserve(result.rows.size());
  for (const auto& row : result.rows) {
    // ORDER BY id ASC, so the last row iterated is always the highest id.
    page.maxId = static_cast<int64_t>(std::get<double>(row[0]));
    page.operations.emplace_back(operationFromRow(row, 1, 6));
  }

  return page;
}

} // namespace margelo::nitro::salvedb
