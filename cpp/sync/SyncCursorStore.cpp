#include "SyncCursorStore.hpp"

namespace margelo::nitro::salvedb {

SyncCursorStore::SyncCursorStore(std::shared_ptr<SQLiteConnection> conn)
  : _conn(std::move(conn)) {}

std::optional<std::string> SyncCursorStore::load(const std::string& entity) {
  auto result = _conn->execute(
    "SELECT cursor FROM _salve_sync_cursors WHERE entity = ?",
    { entity }
  );
  if (result.rows.empty()) return std::nullopt;
  return std::get<std::string>(result.rows[0][0]);
}

void SyncCursorStore::save(const std::string& entity, const std::string& cursorJson) {
  _conn->execute(
    "INSERT OR REPLACE INTO _salve_sync_cursors (entity, cursor) VALUES (?, ?)",
    { entity, cursorJson }
  );
}

} // namespace margelo::nitro::salvedb
