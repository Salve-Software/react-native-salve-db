#include "HybridSalveDatabase.hpp"
#include "DatabaseManager.hpp"
#include "MigrationEngine.hpp"
#include "json_parser.hpp"
#include <NitroModules/ArrayBuffer.hpp>
#include <stdexcept>

namespace margelo::nitro::salvedb {

namespace {

// Blob params are JS-owned; copy them before crossing into the async worker thread.
std::vector<SqlValue> copyBlobParams(const std::vector<SqlValue>& params) {
  std::vector<SqlValue> copied;
  copied.reserve(params.size());
  for (const auto& param : params) {
    if (const auto* buffer = std::get_if<std::shared_ptr<ArrayBuffer>>(&param)) {
      copied.push_back(ArrayBuffer::copy(*buffer));
    } else {
      copied.push_back(param);
    }
  }
  return copied;
}

} // namespace

void HybridSalveDatabase::configure(const std::string& configJson) {
  auto root = json::parse(configJson);
  if (!root.isObject())
    throw std::runtime_error("Database.configure: invalid JSON");

  std::string name = root.getString("name");
  if (name.empty())
    throw std::runtime_error("Database.configure: 'name' is required");

  DatabaseManager::shared().open(name);
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

std::shared_ptr<Promise<IQueryResult>> HybridSalveDatabase::execute(
    const std::string& sql,
    const std::vector<std::variant<nitro::NullType, bool, std::shared_ptr<ArrayBuffer>, std::string, double>>& params) {
  auto safeParams = copyBlobParams(params);
  return Promise<IQueryResult>::async([this, sql, safeParams]() {
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

std::shared_ptr<Promise<INativeSyncResult>> HybridSalveDatabase::triggerSync(const std::string& schemaName) {
  return Promise<INativeSyncResult>::async([this, schemaName]() {
    return _syncOrchestrator.triggerSync(schemaName);
  });
}

} // namespace margelo::nitro::salvedb
