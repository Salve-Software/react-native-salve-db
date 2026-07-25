#pragma once

#include "NativeSyncResult.hpp"
#include <string>
#include <vector>

namespace margelo::nitro::salvedb {

/**
 * Plain C++ collaborator (not a HybridObject) — owned and forwarded to by
 * HybridSalveDatabase, which is the single Nitro-facing orchestrator. Also
 * stateless enough to be safely constructed as a local temporary by native
 * (non-JS) callers, e.g. SyncNativeEntryPoint. Drives one sync session per
 * schema: read queue page → send to API → apply response → advance cursor,
 * looping until `hasMore` is false or `maxPagesPerSession` is hit.
 */
class SyncOrchestrator {
public:
  NativeSyncResult triggerSync(const std::string& schemaName);
  std::vector<NativeSyncResult> triggerSyncAll(bool discardIfBusy);

private:
  NativeSyncResult runSyncSession(const std::string& schemaName);
};

} // namespace margelo::nitro::salvedb
