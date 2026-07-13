#pragma once

#include "NativeSyncResult.hpp"
#include <string>

namespace margelo::nitro::salvedb {

// Plain C++ collaborator (not a HybridObject) — owned and forwarded to by
// HybridSalveDatabase, which is the single Nitro-facing orchestrator. Also
// stateless enough to be safely constructed as a local temporary by native
// (non-JS) callers, e.g. SyncNativeEntryPoint.
class SyncOrchestrator {
public:
  NativeSyncResult triggerSync(const std::string& schemaName);

private:
  NativeSyncResult runSyncSession(const std::string& schemaName);
};

} // namespace margelo::nitro::salvedb
