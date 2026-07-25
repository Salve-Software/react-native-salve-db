#include "SyncPullPhase.hpp"
#include "SyncNetworkFailure.hpp"
#include "../platform/platform.hpp"
#include <stdexcept>
#include <variant>

namespace margelo::nitro::salvedb {

namespace {

int64_t parseCursor(const std::optional<std::string>& stored) {
  if (!stored) return 0;
  try {
    return std::stoll(*stored);
  } catch (...) {
    return 0; // unparseable (pre-#84 opaque cursor) — full pull from scratch
  }
}

} // namespace

PullPhaseResult runPullPhase(const std::string& entity, const SyncContract& contract,
                              SyncOperationApplier& applier, SyncApplyGuard& guard,
                              SyncCursorStore& cursors, SyncHttpRequester& requester) {
  PullPhaseResult result;
  int64_t sinceMs = parseCursor(cursors.load(entity));
  result.cursorMs = sinceMs;

  for (int page = 0; page < contract.maxPagesPerSession; ++page) {
    SyncHttpOutcome outcome = requester.list(contract.endpoint, sinceMs, contract.pageSize);

    if (auto* error = std::get_if<HttpNetworkError>(&outcome)) {
      throw SyncNetworkFailure("SyncPullPhase: pull request failed — " + error->message);
    }

    auto& response = std::get<SyncHttpResponse>(outcome);
    bool isSuccess = response.statusCode >= 200 && response.statusCode < 300;
    if (!isSuccess) {
      throw std::runtime_error("SyncPullPhase: pull request failed with status " + std::to_string(response.statusCode));
    }
    if (!response.body.isArray()) {
      throw std::runtime_error("SyncPullPhase: expected a bare JSON array from GET " + contract.endpoint.basePath);
    }

    const json::Array& rows = response.body.asArray();
    result.pagesFetched++;
    if (rows.empty()) break;

    guard.applyWithBypass([&] {
      ApplyStats pageStats = applier.apply(entity, rows);
      result.stats.inserted += pageStats.inserted;
      result.stats.updated += pageStats.updated;
      result.stats.deleted += pageStats.deleted;
    });

    // Cursor = (last row's deletedAt ?? updatedAt) - 1ms: `since` is
    // exclusive server-side, so persisting the exact timestamp can skip rows
    // that share a millisecond with the page boundary. The 1ms overlap is
    // re-delivered next session and is a no-op via lastWriteWins.
    const json::Value& lastRow = rows.back();
    auto deletedAt = lastRow.get("deletedAt");
    bool hasDeletedAt = deletedAt && deletedAt->get().isNumber();
    auto updatedAt = lastRow.get("updatedAt");
    bool hasUpdatedAt = updatedAt && updatedAt->get().isNumber();
    if (!hasDeletedAt && !hasUpdatedAt) {
      throw std::runtime_error(
        "SyncPullPhase: last row of a pulled page has no numeric updatedAt or deletedAt — cannot advance the cursor"
      );
    }
    double lastTimestamp = hasDeletedAt ? deletedAt->get().asNumber() : updatedAt->get().asNumber();
    int64_t candidateCursor = static_cast<int64_t>(lastTimestamp) - 1;

    // The cursor must strictly advance. A candidate that doesn't (malformed
    // data, or a whole page tied on the same millisecond) would otherwise
    // either persist a regression or spin forever re-fetching the same page.
    if (candidateCursor <= sinceMs) {
      platform::logError("SalveDb",
        "SyncPullPhase: pull page for '" + entity + "' did not advance the cursor past " +
        std::to_string(sinceMs) + " — stopping this session without persisting it"
      );
      break;
    }
    sinceMs = candidateCursor;
    cursors.save(entity, std::to_string(sinceMs));
    result.cursorMs = sinceMs;

    if (static_cast<int>(rows.size()) < contract.pageSize) break;
  }

  return result;
}

} // namespace margelo::nitro::salvedb
