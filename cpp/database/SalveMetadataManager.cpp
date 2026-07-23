#include "SalveMetadataManager.hpp"
#include <sstream>
#include <chrono>

namespace margelo::nitro::salvedb {

SalveMetadataManager::SalveMetadataManager(std::shared_ptr<SQLiteConnection> conn)
  : _conn(std::move(conn)) {}

void SalveMetadataManager::upsert(const SyncMetadataRow& row) {
  _conn->execute(
    "INSERT INTO _salve_sync_metadata"
    " (tableName, localId, remoteId, operation, status, retryCount, lastError, version, createdAt, updatedAt, syncedAt)"
    " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    " ON CONFLICT(tableName, localId) DO UPDATE SET"
    " remoteId=excluded.remoteId, operation=excluded.operation, status=excluded.status,"
    " retryCount=excluded.retryCount, lastError=excluded.lastError, version=excluded.version,"
    " updatedAt=excluded.updatedAt, syncedAt=excluded.syncedAt",
    {
      row.tableName,
      row.localId,
      row.remoteId.has_value() ? row.remoteId.value() : "",
      row.operation,
      row.status,
      static_cast<double>(row.retryCount),
      row.lastError.has_value() ? row.lastError.value() : "",
      row.version.has_value() ? static_cast<double>(row.version.value()) : 0.0,
      static_cast<double>(row.createdAt),
      static_cast<double>(row.updatedAt),
      row.syncedAt.has_value() ? static_cast<double>(row.syncedAt.value()) : 0.0
    }
  );
}

std::optional<SyncMetadataRow> SalveMetadataManager::getByLocalId(const std::string& tableName, const std::string& localId) {
  auto result = _conn->execute(
    "SELECT tableName, localId, remoteId, operation, status, retryCount, lastError, version, createdAt, updatedAt, syncedAt"
    " FROM _salve_sync_metadata WHERE tableName = ? AND localId = ?",
    { tableName, localId }
  );

  if (result.rows.empty()) return std::nullopt;

  auto& row = result.rows[0];
  SyncMetadataRow metadata;
  metadata.tableName = std::get<std::string>(row[0]);
  metadata.localId = std::get<std::string>(row[1]);

  const auto& remoteId = row[2];
  if (std::holds_alternative<std::string>(remoteId)) {
    const auto& val = std::get<std::string>(remoteId);
    if (!val.empty()) metadata.remoteId = val;
  }

  metadata.operation = std::get<std::string>(row[3]);
  metadata.status = std::get<std::string>(row[4]);
  metadata.retryCount = static_cast<int>(std::get<double>(row[5]));

  const auto& lastError = row[6];
  if (std::holds_alternative<std::string>(lastError)) {
    const auto& val = std::get<std::string>(lastError);
    if (!val.empty()) metadata.lastError = val;
  }

  const auto& version = row[7];
  if (std::holds_alternative<double>(version)) {
    double val = std::get<double>(version);
    if (val != 0.0) metadata.version = static_cast<int64_t>(val);
  }

  metadata.createdAt = static_cast<int64_t>(std::get<double>(row[8]));
  metadata.updatedAt = static_cast<int64_t>(std::get<double>(row[9]));

  const auto& syncedAt = row[10];
  if (std::holds_alternative<double>(syncedAt)) {
    double val = std::get<double>(syncedAt);
    if (val != 0.0) metadata.syncedAt = static_cast<int64_t>(val);
  }

  return metadata;
}

std::optional<SyncMetadataRow> SalveMetadataManager::getByRemoteId(const std::string& tableName, const std::string& remoteId) {
  auto result = _conn->execute(
    "SELECT tableName, localId, remoteId, operation, status, retryCount, lastError, version, createdAt, updatedAt, syncedAt"
    " FROM _salve_sync_metadata WHERE tableName = ? AND remoteId = ? LIMIT 1",
    { tableName, remoteId }
  );

  if (result.rows.empty()) return std::nullopt;

  auto& row = result.rows[0];
  SyncMetadataRow metadata;
  metadata.tableName = std::get<std::string>(row[0]);
  metadata.localId = std::get<std::string>(row[1]);

  const auto& remoteIdVal = row[2];
  if (std::holds_alternative<std::string>(remoteIdVal)) {
    const auto& val = std::get<std::string>(remoteIdVal);
    if (!val.empty()) metadata.remoteId = val;
  }

  metadata.operation = std::get<std::string>(row[3]);
  metadata.status = std::get<std::string>(row[4]);
  metadata.retryCount = static_cast<int>(std::get<double>(row[5]));

  const auto& lastError = row[6];
  if (std::holds_alternative<std::string>(lastError)) {
    const auto& val = std::get<std::string>(lastError);
    if (!val.empty()) metadata.lastError = val;
  }

  const auto& version = row[7];
  if (std::holds_alternative<double>(version)) {
    double val = std::get<double>(version);
    if (val != 0.0) metadata.version = static_cast<int64_t>(val);
  }

  metadata.createdAt = static_cast<int64_t>(std::get<double>(row[8]));
  metadata.updatedAt = static_cast<int64_t>(std::get<double>(row[9]));

  const auto& syncedAt = row[10];
  if (std::holds_alternative<double>(syncedAt)) {
    double val = std::get<double>(syncedAt);
    if (val != 0.0) metadata.syncedAt = static_cast<int64_t>(val);
  }

  return metadata;
}

void SalveMetadataManager::backfillSyncedRows(const std::string& tableName, const std::string& primaryKeyColumn) {
  int64_t nowMs = static_cast<int64_t>(std::chrono::duration_cast<std::chrono::milliseconds>(
    std::chrono::system_clock::now().time_since_epoch()).count());

  std::ostringstream sql;
  sql << "INSERT INTO _salve_sync_metadata"
      << " (tableName, localId, remoteId, operation, status, retryCount, version, createdAt, updatedAt, syncedAt)"
      << " SELECT ?, \"" << primaryKeyColumn << "\", NULL, 'insert', 'PENDING', 0, NULL, ?, ?, ?"
      << " FROM \"" << tableName << "\""
      << " WHERE NOT EXISTS ("
      << "   SELECT 1 FROM _salve_sync_metadata"
      << "   WHERE tableName = ? AND localId = \"" << tableName << "\".\"" << primaryKeyColumn << "\""
      << " )";

  _conn->execute(sql.str(), { tableName, static_cast<double>(nowMs), static_cast<double>(nowMs), static_cast<double>(nowMs), tableName });
}

} // namespace margelo::nitro::salvedb
