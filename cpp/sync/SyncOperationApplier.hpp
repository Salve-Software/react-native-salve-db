#pragma once

#include "../database/SQLiteConnection.hpp"
#include "../database/json_parser.hpp"
#include <memory>

namespace margelo::nitro::salvedb {

struct ApplyStats {
  int inserted = 0;
  int updated = 0;
  int deleted = 0;
};

// Plain C++ collaborator (not a HybridObject) — applies server-sent
// ISyncOperation[] to SQLite, resolving conflicts via lastWriteWins on the
// schema's required `updatedAt` column. Must run inside SyncApplyGuard's
// bypass transaction so it never re-enqueues into sync_queue.
class SyncOperationApplier {
public:
  explicit SyncOperationApplier(std::shared_ptr<SQLiteConnection> conn);

  // `expectedEntity` is the schema currently being synced — every operation
  // must target it; anything else is rejected rather than silently writing
  // to an unrelated (or internal) table.
  ApplyStats apply(const std::string& expectedEntity, const json::Array& operations);

private:
  std::shared_ptr<SQLiteConnection> _conn;
};

} // namespace margelo::nitro::salvedb
