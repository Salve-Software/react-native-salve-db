#include "QueryExecutor.hpp"
#include "../database/DatabaseManager.hpp"

namespace margelo::nitro::salvedb {

IQueryResult QueryExecutor::execute(const std::string& sql, const std::vector<SqlValue>& params) {
  return DatabaseManager::shared().connection()->execute(sql, params);
}

void QueryExecutor::beginTransaction() {
  DatabaseManager::shared().connection()->beginTransaction();
}

void QueryExecutor::commit() {
  DatabaseManager::shared().connection()->commit();
}

void QueryExecutor::rollback() {
  DatabaseManager::shared().connection()->rollback();
}

} // namespace margelo::nitro::salvedb
