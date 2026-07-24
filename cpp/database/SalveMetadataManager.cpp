#include "SalveMetadataManager.hpp"
#include <sstream>
#include <chrono>

namespace margelo::nitro::salvedb {

SalveMetadataManager::SalveMetadataManager(std::shared_ptr<SQLiteConnection> conn)
  : _conn(std::move(conn)) {}

void SalveMetadataManager::upsert(const SyncMetadataRow& row) {
  using margelo::nitro::NullType;
  _conn->execute(
    "INSERT INTO _salve_sync_metadata"
    " (tableName, localId, entityId, remoteId, operation, status, retryCount, lastError, version, createdAt, updatedAt, syncedAt)"
    " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    " ON CONFLICT(tableName, localId) DO UPDATE SET"
    " entityId=excluded.entityId, remoteId=excluded.remoteId, operation=excluded.operation, status=excluded.status,"
    " retryCount=excluded.retryCount, lastError=excluded.lastError, version=excluded.version,"
    " updatedAt=excluded.updatedAt, syncedAt=excluded.syncedAt",
    {
      row.tableName,
      row.localId,
      row.entityId,
      row.remoteId.has_value() ? SqlValue(row.remoteId.value()) : NullType{},
      row.operation,
      row.status,
      static_cast<double>(row.retryCount),
      row.lastError.has_value() ? SqlValue(row.lastError.value()) : NullType{},
      row.version.has_value() ? SqlValue(static_cast<double>(row.version.value())) : NullType{},
      static_cast<double>(row.createdAt),
      static_cast<double>(row.updatedAt),
      row.syncedAt.has_value() ? SqlValue(static_cast<double>(row.syncedAt.value())) : NullType{}
    }
  );
}

namespace {

SyncMetadataRow rowToMetadata(const std::vector<SqlValue>& row) {
  SyncMetadataRow metadata;
  metadata.tableName = std::get<std::string>(row[0]);
  metadata.localId = std::get<std::string>(row[1]);
  metadata.entityId = std::get<std::string>(row[2]);

  const auto& remoteId = row[3];
  if (std::holds_alternative<std::string>(remoteId)) {
    const auto& val = std::get<std::string>(remoteId);
    if (!val.empty()) metadata.remoteId = val;
  }

  metadata.operation = std::get<std::string>(row[4]);
  metadata.status = std::get<std::string>(row[5]);
  metadata.retryCount = static_cast<int>(std::get<double>(row[6]));

  const auto& lastError = row[7];
  if (std::holds_alternative<std::string>(lastError)) {
    const auto& val = std::get<std::string>(lastError);
    if (!val.empty()) metadata.lastError = val;
  }

  const auto& version = row[8];
  if (std::holds_alternative<double>(version)) {
    double val = std::get<double>(version);
    if (val != 0.0) metadata.version = static_cast<int64_t>(val);
  }

  metadata.createdAt = static_cast<int64_t>(std::get<double>(row[9]));
  metadata.updatedAt = static_cast<int64_t>(std::get<double>(row[10]));

  const auto& syncedAt = row[11];
  if (std::holds_alternative<double>(syncedAt)) {
    double val = std::get<double>(syncedAt);
    if (val != 0.0) metadata.syncedAt = static_cast<int64_t>(val);
  }

  return metadata;
}

} // namespace

std::optional<SyncMetadataRow> SalveMetadataManager::getByLocalId(const std::string& tableName, const std::string& localId) {
  auto result = _conn->execute(
    "SELECT tableName, localId, entityId, remoteId, operation, status, retryCount, lastError, version, createdAt, updatedAt, syncedAt"
    " FROM _salve_sync_metadata WHERE tableName = ? AND localId = ?",
    { tableName, localId }
  );

  if (result.rows.empty()) return std::nullopt;
  return rowToMetadata(result.rows[0]);
}

std::optional<SyncMetadataRow> SalveMetadataManager::getByRemoteId(const std::string& tableName, const std::string& remoteId) {
  auto result = _conn->execute(
    "SELECT tableName, localId, entityId, remoteId, operation, status, retryCount, lastError, version, createdAt, updatedAt, syncedAt"
    " FROM _salve_sync_metadata WHERE tableName = ? AND remoteId = ? LIMIT 1",
    { tableName, remoteId }
  );

  if (result.rows.empty()) return std::nullopt;
  return rowToMetadata(result.rows[0]);
}

void SalveMetadataManager::backfillSyncedRows(const std::string& tableName, const std::string& primaryKeyColumn) {
  int64_t nowMs = static_cast<int64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::system_clock::now().time_since_epoch()).count());

  std::ostringstream sql;
  sql << "INSERT INTO _salve_sync_metadata"
      << " (tableName, localId, entityId, remoteId, operation, status, retryCount, version, createdAt, updatedAt, syncedAt)"
      << " SELECT ?, \"" << primaryKeyColumn << "\", \"" << primaryKeyColumn << "\", NULL, 'insert', 'PENDING', 0, NULL, ?, ?, NULL"
      << " FROM \"" << tableName << "\""
      << " WHERE NOT EXISTS ("
      << "   SELECT 1 FROM _salve_sync_metadata"
      << "   WHERE tableName = ? AND localId = \"" << tableName << "\".\"" << primaryKeyColumn << "\""
      << " )";

  _conn->execute(sql.str(), { tableName, static_cast<double>(nowMs), static_cast<double>(nowMs), tableName });
}

void SalveMetadataManager::markReplaced(const std::string& tableName, const std::string& localId,
                                         const std::string& newEntityId, int64_t syncedAtMs) {
  _conn->execute(
    "UPDATE _salve_sync_metadata SET entityId = ?, remoteId = ?, status = 'SYNCED',"
    " syncedAt = ?, updatedAt = ? WHERE tableName = ? AND localId = ?",
    { newEntityId, newEntityId, static_cast<double>(syncedAtMs), static_cast<double>(syncedAtMs), tableName, localId }
  );
}

void SalveMetadataManager::markDeletedSynced(const std::string& tableName, const std::string& localId, int64_t syncedAtMs) {
  _conn->execute(
    "UPDATE _salve_sync_metadata SET syncedAt = ?, updatedAt = ? WHERE tableName = ? AND localId = ?",
    { static_cast<double>(syncedAtMs), static_cast<double>(syncedAtMs), tableName, localId }
  );
}

} // namespace margelo::nitro::salvedb
