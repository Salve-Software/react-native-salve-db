#include "HybridSalveQuery.hpp"
#include "../database/DatabaseManager.hpp"

namespace margelo::nitro::salvedb {

std::shared_ptr<Promise<QueryResult>> HybridSalveQuery::execute(
    const std::string& sql,
    const std::vector<std::variant<nitro::NullType, bool, std::shared_ptr<ArrayBuffer>, std::string, double>>& params) {
  return Promise<QueryResult>::async([sql, params]() {
    return DatabaseManager::shared().connection()->execute(sql, params);
  });
}

std::shared_ptr<Promise<void>> HybridSalveQuery::beginTransaction() {
  return Promise<void>::async([]() {
    DatabaseManager::shared().connection()->beginTransaction();
  });
}

std::shared_ptr<Promise<void>> HybridSalveQuery::commit() {
  return Promise<void>::async([]() {
    DatabaseManager::shared().connection()->commit();
  });
}

std::shared_ptr<Promise<void>> HybridSalveQuery::rollback() {
  return Promise<void>::async([]() {
    DatabaseManager::shared().connection()->rollback();
  });
}

} // namespace margelo::nitro::salvedb
