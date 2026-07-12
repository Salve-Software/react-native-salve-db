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

QueryResult HybridSalveDatabase::execute(
  const std::string& sql,
  const std::vector<std::variant<nitro::NullType, bool, std::shared_ptr<ArrayBuffer>, std::string, double>>& params
) {
  return _queryExecutor.execute(sql, params);
}

void HybridSalveDatabase::beginTransaction() {
  _queryExecutor.beginTransaction();
}

void HybridSalveDatabase::commit() {
  _queryExecutor.commit();
}

void HybridSalveDatabase::rollback() {
  _queryExecutor.rollback();
}

std::shared_ptr<Promise<NativeSyncResult>> HybridSalveDatabase::triggerSync(const std::string& schemaName) {
  return Promise<NativeSyncResult>::async([this, schemaName]() {
    return _syncOrchestrator.triggerSync(schemaName);
  });
}

double HybridSalveDatabase::subscribeToChanges(const std::function<void(const std::vector<std::string>&)>& callback) {
  int id = DatabaseManager::shared().connection()->subscribe(
    [callback](std::vector<std::string> tables) { callback(tables); }
  );
  return static_cast<double>(id);
}

void HybridSalveDatabase::unsubscribeFromChanges(double id) {
  DatabaseManager::shared().connection()->unsubscribe(static_cast<int>(id));
}

double HybridSalveDatabase::debugPreparedStatementCount() {
  return static_cast<double>(DatabaseManager::shared().connection()->prepareCount());
}

} // namespace margelo::nitro::salvedb
