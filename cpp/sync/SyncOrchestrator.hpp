#pragma once

#include "INativeSyncResult.hpp"

#include <string>

namespace margelo::nitro::salvedb {

// Plain C++ collaborator (not a HybridObject) — owned and forwarded to by
// HybridSalveDatabase, which is the single Nitro-facing orchestrator.
class SyncOrchestrator {
public:
  INativeSyncResult triggerSync(const std::string& schemaName);
};

} // namespace margelo::nitro::salvedb
