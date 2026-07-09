#include "HybridSalveDatabase.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

void HybridSalveDatabase::configure(const std::string& configJson) {
  throw std::runtime_error("HybridSalveDatabase::configure not yet implemented (TASK-004)");
}

std::shared_ptr<Promise<void>> HybridSalveDatabase::registerSchema(const std::string& schemaJson) {
  throw std::runtime_error("HybridSalveDatabase::registerSchema not yet implemented (TASK-004)");
}

} // namespace margelo::nitro::salvedb
