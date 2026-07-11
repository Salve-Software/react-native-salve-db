#include "SchemaRegistry.hpp"

namespace margelo::nitro::salvedb {

void SchemaRegistry::registerBooleanColumns(const std::string& table, std::unordered_set<std::string> columns) {
  std::lock_guard<std::mutex> lock(_mutex);
  _booleanColumns[table] = std::move(columns);
}

bool SchemaRegistry::isBoolean(const std::string& table, const std::string& column) const {
  std::lock_guard<std::mutex> lock(_mutex);
  auto it = _booleanColumns.find(table);
  if (it == _booleanColumns.end()) return false;
  return it->second.count(column) > 0;
}

} // namespace margelo::nitro::salvedb
