#include "DatabaseManager.hpp"
#include "../platform/platform.hpp"

namespace margelo::nitro::salvedb {

void DatabaseManager::open(const std::string& dbName) {
  std::string dir  = platform::getDocumentsDirectory();
  std::string path = dir + "/" + dbName + ".db";
  _db = std::make_shared<SQLiteConnection>(path);
}

} // namespace margelo::nitro::salvedb
