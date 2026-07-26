#pragma once

#include "SyncApplyGuard.hpp"
#include "SyncContract.hpp"
#include "SyncOperationApplier.hpp"
#include "SyncQueueStore.hpp"
#include "../http/SyncHttpRequester.hpp"
#include "../database/SQLiteConnection.hpp"
#include <memory>
#include <string>

namespace margelo::nitro::salvedb {

struct PushPhaseResult {
  int replaced = 0;
  int deleted = 0;
  int failed = 0;
  bool abortedByNetwork = false;
  std::string networkError;
};

// Phase 1 of a sync session: drains sync_queue, one HTTP call per item. A
// network failure aborts the rest of the phase (remaining items stay
// PENDING); an HTTP error isolates just that item (marked FAILED, session
// continues). See docs/sync-rest-contract.md.
PushPhaseResult runPushPhase(const std::string& entity, const SyncContract& contract,
                              std::shared_ptr<SQLiteConnection> conn, SyncQueueStore& queue,
                              SyncOperationApplier& applier, SyncApplyGuard& guard,
                              SyncHttpRequester& requester);

} // namespace margelo::nitro::salvedb
