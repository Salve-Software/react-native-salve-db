#pragma once

#include "../database/SQLiteConnection.hpp"
#include <memory>
#include <optional>
#include <string>

namespace margelo::nitro::salvedb {

// Plain C++ collaborator (not a HybridObject) — reads/writes the per-entity
// sync cursor persisted in `_salve_sync_cursors`, so it survives a restart.
class SyncCursorStore {
public:
  explicit SyncCursorStore(std::shared_ptr<SQLiteConnection> conn);

  std::optional<std::string> load(const std::string& entity);
  void save(const std::string& entity, const std::string& cursorJson);

private:
  std::shared_ptr<SQLiteConnection> _conn;
};

} // namespace margelo::nitro::salvedb
