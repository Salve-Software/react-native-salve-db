#include "HybridSalveSync.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

std::shared_ptr<Promise<NativeSyncResult>> HybridSalveSync::triggerSync(const std::string& schemaName) {
  throw std::runtime_error("HybridSalveSync::triggerSync not yet implemented (TASK-012)");
}

} // namespace margelo::nitro::salvedb
