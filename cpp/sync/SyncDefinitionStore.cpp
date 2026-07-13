#include "SyncDefinitionStore.hpp"

namespace margelo::nitro::salvedb {

SyncDefinitionStore::SyncDefinitionStore(std::shared_ptr<SQLiteConnection> conn)
  : _conn(std::move(conn)) {}

std::optional<json::Value> SyncDefinitionStore::definitionFor(const std::string& schema) {
  auto result = _conn->execute(
    "SELECT definition FROM _salve_sync_definitions WHERE name = ?",
    { schema }
  );
  if (result.rows.empty()) return std::nullopt;
  return json::parse(std::get<std::string>(result.rows[0][0]));
}

std::vector<std::string> SyncDefinitionStore::enabledSchemas() {
  auto result = _conn->execute("SELECT name FROM _salve_sync_definitions", {});
  std::vector<std::string> names;
  names.reserve(result.rows.size());
  for (auto& row : result.rows) {
    names.push_back(std::get<std::string>(row[0]));
  }
  return names;
}

void SyncDefinitionStore::save(const std::string& schema, const json::Value& definition) {
  _conn->execute(
    "INSERT OR REPLACE INTO _salve_sync_definitions (name, definition) VALUES (?, ?)",
    { schema, json::stringify(definition) }
  );
}

void SyncDefinitionStore::remove(const std::string& schema) {
  _conn->execute("DELETE FROM _salve_sync_definitions WHERE name = ?", { schema });
}

} // namespace margelo::nitro::salvedb
