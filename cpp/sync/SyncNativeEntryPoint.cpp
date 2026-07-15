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

} // namespace margelo::nitro::salvedb
