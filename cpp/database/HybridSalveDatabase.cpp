#include "HybridSalveDatabase.hpp"
#include "DatabaseManager.hpp"
#include "MigrationEngine.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

void HybridSalveDatabase::configure(const ConfigureParams& params) {
  if (params.name.empty())
    throw std::runtime_error("Database.configure: 'name' is required");
  DatabaseManager::shared().open(params.name);
}

std::shared_ptr<Promise<void>> HybridSalveDatabase::registerSchema(const std::string& schemaJson) {
  return Promise<void>::async([schemaJson]() {
    auto& mgr = DatabaseManager::shared();
    if (!mgr.isOpen())
      throw std::runtime_error("Database.register: call Database.configure() before registering schemas");
    auto schema = MigrationEngine::parseSchemaJson(schemaJson);
    MigrationEngine engine(mgr.connection());
    engine.registerSchema(schema);
  });
}

std::shared_ptr<Promise<QueryResult>> HybridSalveDatabase::execute(
    const std::string& sql,
    const std::vector<std::variant<nitro::NullType, bool, std::shared_ptr<ArrayBuffer>, std::string, double>>& params) {
  return Promise<QueryResult>::async([sql, params]() {
    return DatabaseManager::shared().connection()->execute(sql, params);
  });
}

std::shared_ptr<Promise<void>> HybridSalveDatabase::beginTransaction() {
  return Promise<void>::async([]() {
    DatabaseManager::shared().connection()->beginTransaction();
  });
}

std::shared_ptr<Promise<void>> HybridSalveDatabase::commit() {
  return Promise<void>::async([]() {
    DatabaseManager::shared().connection()->commit();
  });
}

std::shared_ptr<Promise<void>> HybridSalveDatabase::rollback() {
  return Promise<void>::async([]() {
    DatabaseManager::shared().connection()->rollback();
  });
}

std::shared_ptr<Promise<NativeSyncResult>> HybridSalveDatabase::triggerSync(const std::string& schemaName) {
  throw std::runtime_error("HybridSalveDatabase::triggerSync not yet implemented (TASK-012)");
}

} // namespace margelo::nitro::salvedb
