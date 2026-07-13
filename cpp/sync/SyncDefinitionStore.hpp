#pragma once

#include "../database/SQLiteConnection.hpp"
#include "../database/json_parser.hpp"
#include <memory>
#include <optional>
#include <string>
#include <vector>

namespace margelo::nitro::salvedb {

// Plain C++ collaborator (not a HybridObject) — persists each schema's full
// `sync` contract in `_salve_sync_definitions`, so it survives a restart
// without depending on JS having run register() in the current process.
// Unlike SyncCursorStore, definitionFor parses the JSON itself: the only
// consumer (SyncOrchestrator) always needs it as json::Value, never raw text.
class SyncDefinitionStore {
public:
  explicit SyncDefinitionStore(std::shared_ptr<SQLiteConnection> conn);

  std::optional<json::Value> definitionFor(const std::string& schema);
  std::vector<std::string> enabledSchemas();
  void save(const std::string& schema, const json::Value& definition);
  void remove(const std::string& schema);

private:
  std::shared_ptr<SQLiteConnection> _conn;
};

} // namespace margelo::nitro::salvedb
