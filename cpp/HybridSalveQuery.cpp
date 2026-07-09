#include "HybridSalveQuery.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

std::shared_ptr<Promise<QueryResult>> HybridSalveQuery::execute(const std::string& sql, const std::vector<std::variant<nitro::NullType, bool, std::shared_ptr<ArrayBuffer>, std::string, double>>& params) {
  throw std::runtime_error("HybridSalveQuery::execute not yet implemented (TASK-007)");
}

std::shared_ptr<Promise<void>> HybridSalveQuery::beginTransaction() {
  throw std::runtime_error("HybridSalveQuery::beginTransaction not yet implemented (TASK-007)");
}

std::shared_ptr<Promise<void>> HybridSalveQuery::commit() {
  throw std::runtime_error("HybridSalveQuery::commit not yet implemented (TASK-007)");
}

std::shared_ptr<Promise<void>> HybridSalveQuery::rollback() {
  throw std::runtime_error("HybridSalveQuery::rollback not yet implemented (TASK-007)");
}

} // namespace margelo::nitro::salvedb
