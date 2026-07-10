#include "HybridSalveDatabase.hpp"
#include "DatabaseManager.hpp"
#include "MigrationEngine.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

namespace {

// ArrayBuffer::data()/size() may only be touched on the JS thread that created
// them, so blob params must be copied here before crossing into Promise::async.
std::vector<SqlValue> copyBlobParams(const std::vector<SqlValue>& params) {
  std::vector<SqlValue> safe;
  safe.reserve(params.size());
  for (const auto& param : params) {
    if (auto* blob = std::get_if<std::shared_ptr<ArrayBuffer>>(&param)) {
      safe.emplace_back(ArrayBuffer::copy(*blob));
    } else {
      safe.push_back(param);
    }
  }
  return safe;
}

} // namespace

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
  auto safeParams = copyBlobParams(params);
  return Promise<QueryResult>::async([this, sql, safeParams]() {
    return _queryExecutor.execute(sql, safeParams);
  });
}

std::shared_ptr<Promise<void>> HybridSalveDatabase::beginTransaction() {
  return Promise<void>::async([this]() {
    _queryExecutor.beginTransaction();
  });
}

std::shared_ptr<Promise<void>> HybridSalveDatabase::commit() {
  return Promise<void>::async([this]() {
    _queryExecutor.commit();
  });
}

std::shared_ptr<Promise<void>> HybridSalveDatabase::rollback() {
  return Promise<void>::async([this]() {
    _queryExecutor.rollback();
  });
}

std::shared_ptr<Promise<NativeSyncResult>> HybridSalveDatabase::triggerSync(const std::string& schemaName) {
  return Promise<NativeSyncResult>::async([this, schemaName]() {
    return _syncOrchestrator.triggerSync(schemaName);
  });
}

double HybridSalveDatabase::debugPreparedStatementCount() {
  return static_cast<double>(DatabaseManager::shared().connection()->prepareCount());
}

} // namespace margelo::nitro::salvedb
