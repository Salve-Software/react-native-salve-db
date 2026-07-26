#pragma once

#include "../database/SQLiteConnection.hpp"
#include "../database/json_parser.hpp"
#include <memory>
#include <string>
#include <unordered_map>
#include <unordered_set>

namespace margelo::nitro::salvedb {

struct ApplyStats {
  int inserted = 0;
  int updated = 0;
  int deleted = 0;
};

// Plain C++ collaborator (not a HybridObject) — applies REST sync results to
// SQLite, resolving conflicts via lastWriteWins on `updatedAt`. Must run
// inside SyncApplyGuard's bypass transaction so it never re-enqueues into
// sync_queue.
class SyncOperationApplier {
public:
  explicit SyncOperationApplier(std::shared_ptr<SQLiteConnection> conn);

  // Pull: applies a page of bare entities. deletedAt != null is a tombstone
  // (soft-deletes locally); everything else infers insert vs update by
  // existence. Marks pulled rows' metadata SYNCED/DELETED via markPulledSynced.
  ApplyStats apply(const std::string& expectedEntity, const json::Array& rows);

  struct ReplaceIdentity {
    std::string oldEntityId;
    std::string resolvedEntityId;
  };

  // Push success (POST/PATCH) step 1: records the server write in metadata only — never touches the domain table, so it can't fail on a PK collision.
  ReplaceIdentity recordRemoteSuccess(const std::string& expectedEntity, const std::string& localId,
                                       const json::Value& responseEntity);

  // Push success step 2: rewrites the domain-table row (PK + lastWriteWins data) and cascades FKs; can throw independently of step 1 already having committed.
  void rewriteLocalRow(const std::string& expectedEntity, const ReplaceIdentity& identity,
                        const json::Value& responseEntity);

  // Push success (DELETE, 204): row is already soft-deleted locally, just stamps syncedAt.
  void confirmDeleted(const std::string& expectedEntity, const std::string& localId);

private:
  struct TableColumns {
    std::string primaryKey;
    std::unordered_set<std::string> all;
  };

  // Populated on first use per entity — this instance lives for one sync
  // session, so PRAGMA table_info runs at most once per entity, not per row.
  const TableColumns& columnsFor(const std::string& table);

  std::shared_ptr<SQLiteConnection> _conn;
  std::unordered_map<std::string, TableColumns> _columnsCache;
};

} // namespace margelo::nitro::salvedb
