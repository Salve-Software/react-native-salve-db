#include "SyncOrchestrator.hpp"
#include "SyncApplyGuard.hpp"
#include "SyncContract.hpp"
#include "SyncCursorStore.hpp"
#include "SyncDefinitionStore.hpp"
#include "SyncNetworkFailure.hpp"
#include "SyncOperationApplier.hpp"
#include "SyncPullPhase.hpp"
#include "SyncPushPhase.hpp"
#include "SyncQueueStore.hpp"
#include "../database/DatabaseManager.hpp"
#include "../http/SyncHttpRequester.hpp"
#include "../platform/platform.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

namespace {

double nowMillis() {
  using namespace std::chrono;
  return static_cast<double>(duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count());
}

} // namespace

// Lock acquired here, not inside runSyncSession() — keep it lock-agnostic.
std::optional<NativeSyncResult> SyncOrchestrator::triggerSync(const std::string& schemaName, bool discardIfBusy) {
  auto lock = discardIfBusy
    ? DatabaseManager::shared().tryLockSync()
    : DatabaseManager::shared().lockSync();

  if (discardIfBusy && !lock.owns_lock()) {
    platform::logError("SalveDb", "SyncOrchestrator: sync already in progress, discarding triggerSync for schema '" + schemaName + "'");
    return std::nullopt;
  }

  return runSyncSession(schemaName);
}

// No lock here — see SyncOrchestrator.hpp; lockSync()/tryLockSync() belong to
// triggerSync/triggerSyncAll only.
NativeSyncResult SyncOrchestrator::runSyncSession(const std::string& schemaName) {
  auto conn = DatabaseManager::shared().connection();

  auto definition = SyncDefinitionStore(conn).definitionFor(schemaName);
  if (!definition || !definition->getBool("enabled", false)) {
    throw std::runtime_error("SyncOrchestrator: schema '" + schemaName + "' has no sync.enabled contract registered");
  }
  SyncContract contract = SyncContract::fromDefinition(*definition);

  SyncHttpRequester requester(DatabaseManager::shared().credentials(), DatabaseManager::shared().network());
  SyncQueueStore queue(conn);
  SyncApplyGuard guard(conn);
  SyncCursorStore cursors(conn);
  SyncOperationApplier applier(conn);

  double start = nowMillis();

  PushPhaseResult push = runPushPhase(schemaName, contract, conn, queue, applier, guard, requester);
  if (push.abortedByNetwork) {
    throw SyncNetworkFailure("SyncOrchestrator: push phase aborted by a network failure — " + push.networkError);
  }

  PullPhaseResult pull = runPullPhase(schemaName, contract, applier, guard, cursors, requester);

  std::optional<std::string> exposedCursor;
  if (pull.cursorMs.has_value()) exposedCursor = std::to_string(*pull.cursorMs);

  double inserted = static_cast<double>(pull.stats.inserted);
  double updated = static_cast<double>(pull.stats.updated + push.replaced);
  double deleted = static_cast<double>(pull.stats.deleted + push.deleted);

  return NativeSyncResult(
    exposedCursor,
    inserted + updated + deleted,
    inserted,
    updated,
    deleted,
    nowMillis() - start
  );
}

// Lock acquired here, not inside runSyncSession() — keep it lock-agnostic.
std::vector<NativeSyncResult> SyncOrchestrator::triggerSyncAll(bool discardIfBusy) {
  auto lock = discardIfBusy
    ? DatabaseManager::shared().tryLockSync()
    : DatabaseManager::shared().lockSync();

  if (discardIfBusy && !lock.owns_lock()) {
    platform::logError("SalveDb", "SyncOrchestrator: sync already in progress, discarding triggerSyncAll");
    return {};
  }

  SyncDefinitionStore defStore(DatabaseManager::shared().connection());

  std::vector<NativeSyncResult> results;
  for (const auto& schemaName : defStore.enabledSchemas()) {
    try {
      results.push_back(runSyncSession(schemaName));
    } catch (const SyncNetworkFailure& e) {
      // The network itself is down — trying the remaining schemas would just
      // pay the same retry cost again for a connection already proven dead.
      platform::logError("SalveDb", "SyncOrchestrator: triggerSyncAll — schema '" + schemaName + "' failed: " + e.what() + " — stopping the remaining schemas");
      break;
    } catch (const std::exception& e) {
      platform::logError("SalveDb", "SyncOrchestrator: triggerSyncAll — schema '" + schemaName + "' failed: " + e.what());
    }
  }
  return results;
}

} // namespace margelo::nitro::salvedb
