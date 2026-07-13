#pragma once

#include "NativeSyncResult.hpp"
#include <string>

namespace margelo::nitro::salvedb {

// Plain C++ collaborator (not a HybridObject) — owned and forwarded to by
// HybridSalveDatabase, which is the single Nitro-facing orchestrator.
class SyncOrchestrator {
public:
  NativeSyncResult triggerSync(const std::string& schemaName);
};

} // namespace margelo::nitro::salvedb
