#pragma once

#include "../database/json_parser.hpp"
#include <mutex>
#include <optional>
#include <string>
#include <unordered_map>

namespace margelo::nitro::salvedb {

// Process-wide registry of each schema's full `sync` contract, keyed by schema name.
class SyncDefinitionRegistry {
public:
  static SyncDefinitionRegistry& shared() {
    static SyncDefinitionRegistry instance;
    return instance;
  }

  void registerDefinition(const std::string& schema, json::Value definition);
  void unregisterDefinition(const std::string& schema);
  std::optional<json::Value> definitionFor(const std::string& schema) const;

  // Discards all registrations — call on DatabaseManager::open() to avoid stale entries.
  void clear();

private:
  SyncDefinitionRegistry() = default;

  mutable std::mutex _mutex;
  std::unordered_map<std::string, json::Value> _definitions;
};

} // namespace margelo::nitro::salvedb
