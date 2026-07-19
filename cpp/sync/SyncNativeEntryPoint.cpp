#include "SyncNativeEntryPoint.hpp"
#include "SyncOrchestrator.hpp"
#include "../database/DatabaseManager.hpp"
#include "../platform/platform.hpp"
#include <exception>

namespace margelo::nitro::salvedb {

void triggerSyncAllFromNative() {
  if (!DatabaseManager::shared().isOpen()) {
    platform::logError("SalveDb", "SyncNativeEntryPoint: database not configured yet, skipping");
    return;
  }

  try {
    SyncOrchestrator().triggerSyncAll(/*discardIfBusy*/ true);
  } catch (const std::exception& e) {
    platform::logError("SalveDb", std::string("SyncNativeEntryPoint: triggerSyncAllFromNative failed: ") + e.what());
  } catch (...) {
    platform::logError("SalveDb", "SyncNativeEntryPoint: triggerSyncAllFromNative failed with an unknown exception");
  }
}

void wakeBackgroundSyncFromNative() {
  bool ready;
  try {
    ready = DatabaseManager::shared().reopenFromPersistedConfigIfNeeded();
  } catch (const std::exception& e) {
    platform::logError("SalveDb", std::string("SyncNativeEntryPoint: wakeBackgroundSyncFromNative failed to rehydrate: ") + e.what());
    return;
  } catch (...) {
    platform::logError("SalveDb", "SyncNativeEntryPoint: wakeBackgroundSyncFromNative failed to rehydrate with an unknown exception");
    return;
  }

  if (!ready) {
    platform::logError("SalveDb", "SyncNativeEntryPoint: no persisted config, skipping background wake");
    return;
  }

  triggerSyncAllFromNative();
}

NativeBackgroundConstraints nativeBackgroundConstraints() {
  try {
    DatabaseManager::shared().reopenFromPersistedConfigIfNeeded();
  } catch (const std::exception& e) {
    platform::logError("SalveDb", std::string("SyncNativeEntryPoint: nativeBackgroundConstraints failed to rehydrate: ") + e.what());
    return NativeBackgroundConstraints{false, 0, false, false};
  } catch (...) {
    platform::logError("SalveDb", "SyncNativeEntryPoint: nativeBackgroundConstraints failed to rehydrate with an unknown exception");
    return NativeBackgroundConstraints{false, 0, false, false};
  }

  auto background = DatabaseManager::shared().background();
  if (!background.has_value()) {
    return NativeBackgroundConstraints{false, 0, false, false};
  }
  return NativeBackgroundConstraints{
    true, background->minimumIntervalMs, background->requiresNetwork, background->requiresCharging
  };
}

} // namespace margelo::nitro::salvedb
