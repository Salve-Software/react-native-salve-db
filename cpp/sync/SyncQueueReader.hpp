#pragma once

#include "../database/SQLiteConnection.hpp"
#include "../database/json_parser.hpp"
#include "SyncQueueStatus.hpp"
#include <memory>
#include <string>

namespace margelo::nitro::salvedb {

// Plain C++ collaborator (not a HybridObject) — read-only access to sync_queue.
class SyncQueueReader {
public:
  explicit SyncQueueReader(std::shared_ptr<SQLiteConnection> conn);

  // FIFO, up to `limit` rows, serialized to the TS `ISyncOperation` shape.
  json::Array readOperations(int limit);

  // Pending count + oldest `updated_at` for one entity, no sync involved.
  SyncQueueStatus getStatus(const std::string& entity);

private:
  std::shared_ptr<SQLiteConnection> _conn;
};

} // namespace margelo::nitro::salvedb
