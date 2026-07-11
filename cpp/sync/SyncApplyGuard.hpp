#pragma once

#include "../database/SQLiteConnection.hpp"
#include <functional>
#include <memory>

namespace margelo::nitro::salvedb {

// Encapsulates BEGIN/lock/apply/unlock/COMMIT so downstream sync-apply code
// (TASK-012) never has to hand-roll the _sync_apply_lock bypass SQL.
class SyncApplyGuard {
public:
  explicit SyncApplyGuard(std::shared_ptr<SQLiteConnection> conn);

  // Runs fn() inside a transaction with _sync_apply_lock held, so writes
  // fn() performs don't get re-queued into sync_queue by the sync triggers.
  // If fn() throws, the whole transaction (writes + lock row) rolls back.
  void applyWithBypass(const std::function<void()>& fn);

private:
  std::shared_ptr<SQLiteConnection> _conn;
};

} // namespace margelo::nitro::salvedb
