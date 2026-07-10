#include "SyncOrchestrator.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

INativeSyncResult SyncOrchestrator::triggerSync(const std::string& schemaName) {
  throw std::runtime_error("SyncOrchestrator::triggerSync not yet implemented (TASK-012)");
}

} // namespace margelo::nitro::salvedb
