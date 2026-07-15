#include "SyncNativeEntryPoint.hpp"
#include "SyncOrchestrator.hpp"
#include "../database/DatabaseManager.hpp"
#include <exception>
#include <iostream>

namespace margelo::nitro::salvedb {

void triggerSyncAllFromNative() {
  if (!DatabaseManager::shared().isOpen()) {
    std::cerr << "SyncNativeEntryPoint: database not configured yet, skipping" << std::endl;
    return;
  }

  try {
    SyncOrchestrator().triggerSyncAll(/*discardIfBusy*/ true);
  } catch (const std::exception& e) {
    std::cerr << "SyncNativeEntryPoint: triggerSyncAllFromNative failed: " << e.what() << std::endl;
  } catch (...) {
    std::cerr << "SyncNativeEntryPoint: triggerSyncAllFromNative failed with an unknown exception" << std::endl;
  }
}

void wakeBackgroundSyncFromNative() {
  bool ready;
  try {
    ready = DatabaseManager::shared().reopenFromPersistedConfigIfNeeded();
  } catch (const std::exception& e) {
    std::cerr << "SyncNativeEntryPoint: wakeBackgroundSyncFromNative failed to rehydrate: " << e.what() << std::endl;
    return;
  } catch (...) {
    std::cerr << "SyncNativeEntryPoint: wakeBackgroundSyncFromNative failed to rehydrate with an unknown exception" << std::endl;
    return;
  }

  if (!ready) {
    std::cerr << "SyncNativeEntryPoint: no persisted config, skipping background wake" << std::endl;
    return;
  }

  triggerSyncAllFromNative();
}

NativeBackgroundConstraints nativeBackgroundConstraints() {
  try {
    DatabaseManager::shared().reopenFromPersistedConfigIfNeeded();
  } catch (...) {}

  auto background = DatabaseManager::shared().background();
  if (!background.has_value()) {
    return NativeBackgroundConstraints{false, 0, false, false};
  }
  return NativeBackgroundConstraints{
    true, background->minimumIntervalMs, background->requiresNetwork, background->requiresCharging
  };
}

} // namespace margelo::nitro::salvedb
