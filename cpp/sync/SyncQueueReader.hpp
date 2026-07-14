#pragma once

#include "../database/SQLiteConnection.hpp"
#include "../database/json_parser.hpp"
#include "SyncQueueStatus.hpp"
#include <cstdint>
#include <memory>
#include <optional>
#include <string>

namespace margelo::nitro::salvedb {

struct SyncQueuePage {
  json::Array operations;
  std::optional<int64_t> maxId; // highest sync_queue.id in this page, for the delete-after-apply cutoff
};

// Plain C++ collaborator (not a HybridObject) — read-only access to sync_queue.
class SyncQueueReader {
public:
  explicit SyncQueueReader(std::shared_ptr<SQLiteConnection> conn);

  // FIFO, up to `limit` rows, serialized to the TS `ISyncOperation` shape.
  json::Array readOperations(int limit);

  // Pending count + oldest `updated_at` for one entity, no sync involved.
  SyncQueueStatus getStatus(const std::string& entity);

  // Same, filtered to a single entity, plus the row id needed to clear only what was sent.
  SyncQueuePage readPage(const std::string& entity, int limit);

private:
  std::shared_ptr<SQLiteConnection> _conn;
};

} // namespace margelo::nitro::salvedb
