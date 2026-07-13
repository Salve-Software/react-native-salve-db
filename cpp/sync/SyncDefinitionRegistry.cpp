#include "SyncDefinitionRegistry.hpp"

namespace margelo::nitro::salvedb {

void SyncDefinitionRegistry::registerDefinition(const std::string& schema, json::Value definition) {
  std::lock_guard<std::mutex> lock(_mutex);
  _definitions[schema] = std::move(definition);
}

void SyncDefinitionRegistry::unregisterDefinition(const std::string& schema) {
  std::lock_guard<std::mutex> lock(_mutex);
  _definitions.erase(schema);
}

std::optional<json::Value> SyncDefinitionRegistry::definitionFor(const std::string& schema) const {
  std::lock_guard<std::mutex> lock(_mutex);
  auto it = _definitions.find(schema);
  if (it == _definitions.end()) return std::nullopt;
  return it->second;
}

void SyncDefinitionRegistry::clear() {
  std::lock_guard<std::mutex> lock(_mutex);
  _definitions.clear();
}

} // namespace margelo::nitro::salvedb
