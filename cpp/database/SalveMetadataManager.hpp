#pragma once

#include "SQLiteConnection.hpp"
#include <cstdint>
#include <memory>
#include <optional>
#include <string>

namespace margelo::nitro::salvedb {

struct SyncMetadataRow {
  std::string tableName;
  std::string localId;
  std::string entityId;
  std::optional<std::string> remoteId;
  std::string operation;
  std::string status;
  int retryCount = 0;
  std::optional<std::string> lastError;
  std::optional<int64_t> version;
  int64_t createdAt = 0;
  int64_t updatedAt = 0;
  std::optional<int64_t> syncedAt;
};

// Plain C++ collaborator (not a HybridObject) — owns reads/writes of `_salve_sync_metadata`.
class SalveMetadataManager {
public:
  explicit SalveMetadataManager(std::shared_ptr<SQLiteConnection> conn);

  void upsert(const SyncMetadataRow& row);
  std::optional<SyncMetadataRow> getByLocalId(const std::string& tableName, const std::string& localId);
  std::optional<SyncMetadataRow> getByRemoteId(const std::string& tableName, const std::string& remoteId);
  void backfillSyncedRows(const std::string& tableName, const std::string& primaryKeyColumn);

  // Replace-transaction ack: entityId becomes the server id, status SYNCED.
  void markReplaced(const std::string& tableName, const std::string& localId,
                     const std::string& newEntityId, int64_t syncedAtMs);

  // Soft-delete ack: confirms the delete without touching status (stays DELETED).
  void markDeletedSynced(const std::string& tableName, const std::string& localId, int64_t syncedAtMs);

private:
  std::shared_ptr<SQLiteConnection> _conn;
};

} // namespace margelo::nitro::salvedb
