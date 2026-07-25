#pragma once

#include "../database/SQLiteConnection.hpp"
#include <cstdint>
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace margelo::nitro::salvedb {

struct SyncQueueItem {
  int64_t id;
  std::string operation;               // "insert" | "update" | "delete"
  std::string queuedEntityId;          // sync_queue.entity_id snapshot
  std::optional<std::string> localId;  // frozen id, from joined metadata
};

// Plain C++ collaborator (not a HybridObject) — reads and writes sync_queue push state (#84).
class SyncQueueStore {
public:
  explicit SyncQueueStore(std::shared_ptr<SQLiteConnection> conn);

  std::vector<SyncQueueItem> readPending(const std::string& entity, int limit);

  void remove(int64_t id);
  void markFailed(int64_t id, const std::string& error);
  // Excluded from readPending's status filter — stays in the queue but stops being auto-retried.
  void markBlocked(int64_t id, const std::string& reason);
  void rewriteEntityId(const std::string& entity, const std::string& oldId, const std::string& newId);

private:
  std::shared_ptr<SQLiteConnection> _conn;
};

} // namespace margelo::nitro::salvedb
