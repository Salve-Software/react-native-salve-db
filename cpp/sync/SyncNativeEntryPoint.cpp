#include "SyncNativeEntryPoint.hpp"
#include "SyncOrchestrator.hpp"
#include "../database/DatabaseManager.hpp"
#include "../database/NativeConfigStore.hpp"
#include "../platform/platform.hpp"
#include <exception>
#include <optional>

namespace margelo::nitro::salvedb {

namespace {

void runSyncAll() {
  try {
    SyncOrchestrator().triggerSyncAll(/*discardIfBusy*/ true);
  } catch (const std::exception& e) {
    platform::logError("SalveDb", std::string("SyncNativeEntryPoint: triggerSyncAll failed: ") + e.what());
  } catch (...) {
    platform::logError("SalveDb", "SyncNativeEntryPoint: triggerSyncAll failed with an unknown exception");
  }
}

} // namespace

// Foreground trigger. Gated on appConfigured() rather than isOpen(): a sync
// holds the sync mutex, and Database.configure() waits for it on the JS thread.
void triggerSyncAllFromNative() {
  if (!DatabaseManager::shared().appConfigured()) {
    platform::logError("SalveDb", "SyncNativeEntryPoint: Database.configure() has not run yet, skipping foreground sync");
    return;
  }

  runSyncAll();
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

  // Headless path — no appConfigured() gate, JS never runs here.
  runSyncAll();
}

// Must not open the database: the platform layer calls this at process load,
// before Database.configure().
NativeBackgroundConstraints nativeBackgroundConstraints() {
  std::optional<BackgroundConfig> background;
  try {
    if (DatabaseManager::shared().isOpen()) {
      background = DatabaseManager::shared().background();
    } else if (auto persisted = NativeConfigStore::load()) {
      background = persisted->background;
    }
  } catch (const std::exception& e) {
    platform::logError("SalveDb", std::string("SyncNativeEntryPoint: nativeBackgroundConstraints failed to read config: ") + e.what());
    return NativeBackgroundConstraints{false, 0, false, false};
  } catch (...) {
    platform::logError("SalveDb", "SyncNativeEntryPoint: nativeBackgroundConstraints failed to read config with an unknown exception");
    return NativeBackgroundConstraints{false, 0, false, false};
  }

  if (!background.has_value()) {
    return NativeBackgroundConstraints{false, 0, false, false};
  }
  return NativeBackgroundConstraints{
    true, background->minimumIntervalMs, background->requiresNetwork, background->requiresCharging
  };
}

} // namespace margelo::nitro::salvedb
