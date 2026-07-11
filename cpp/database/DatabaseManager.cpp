#include "DatabaseManager.hpp"
#include "SchemaRegistry.hpp"
#include "../platform/platform.hpp"

namespace margelo::nitro::salvedb {

void DatabaseManager::open(const std::string& dbName) {
  std::string dir  = platform::getDocumentsDirectory();
  std::string path = dir + "/" + dbName + ".db";
  _connection = std::make_shared<SQLiteConnection>(path);
  // Boolean-column registrations are keyed by table name, not by db file — a stale
  // entry from a previously-open database would otherwise silently leak into this one.
  SchemaRegistry::shared().clear();
}

} // namespace margelo::nitro::salvedb
