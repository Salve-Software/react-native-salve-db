#pragma once

#include "NativeSyncResult.hpp"
#include <chrono>
#include <string>

namespace margelo::nitro::salvedb {

// Plain C++ collaborator (not a HybridObject) — owned and forwarded to by
// HybridSalveDatabase, which is the single Nitro-facing orchestrator.
class SyncOrchestrator {
public:
  NativeSyncResult triggerSync(const std::string& schemaName);
};

namespace sync_test {
  // Test-only: overrides the hardcoded 5s retry delay so tests don't sleep for real.
  void setRetryDelay(std::chrono::milliseconds delay);
}

} // namespace margelo::nitro::salvedb
