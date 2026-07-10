#include "HybridSalveDatabase.hpp"
#include "DatabaseManager.hpp"
#include "MigrationEngine.hpp"
#include "json_parser.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

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

} // namespace margelo::nitro::salvedb
