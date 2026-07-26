#pragma once

#include "../database/SQLiteConnection.hpp"
#include <memory>
#include <optional>
#include <string>

namespace margelo::nitro::salvedb {

// Plain C++ collaborator (not a HybridObject) — reads/writes the per-entity
// sync cursor persisted in `_salve_sync_cursors`, so it survives a restart.
// Value is always decimal epoch millis, never JSON.
class SyncCursorStore {
public:
  explicit SyncCursorStore(std::shared_ptr<SQLiteConnection> conn);

  std::optional<std::string> load(const std::string& entity);
  void save(const std::string& entity, const std::string& cursor);

  void remove(const std::string& entity);
  void removeAll();

private:
  std::shared_ptr<SQLiteConnection> _conn;
};

} // namespace margelo::nitro::salvedb
