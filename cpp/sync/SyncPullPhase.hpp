#pragma once

#include "SyncApplyGuard.hpp"
#include "SyncContract.hpp"
#include "SyncCursorStore.hpp"
#include "SyncOperationApplier.hpp"
#include "../http/SyncHttpRequester.hpp"
#include <cstdint>
#include <optional>
#include <string>

namespace margelo::nitro::salvedb {

struct PullPhaseResult {
  ApplyStats stats;
  std::optional<int64_t> cursorMs;
  int pagesFetched = 0;
};

// Phase 2 of a sync session: paginated GET, applying tombstones and lastWriteWins.
PullPhaseResult runPullPhase(const std::string& entity, const SyncContract& contract,
                              SyncOperationApplier& applier, SyncApplyGuard& guard,
                              SyncCursorStore& cursors, SyncHttpRequester& requester);

} // namespace margelo::nitro::salvedb
