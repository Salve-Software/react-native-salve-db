#include "DatabaseManager.hpp"
#include "platform.hpp"

namespace margelo::nitro::salvedb {

void DatabaseManager::open(const std::string& dbName) {
  std::string dir  = getPlatformDocumentsDirectory();
  std::string path = dir + "/" + dbName + ".db";
  _connection = std::make_shared<SQLiteConnection>(path);
}

} // namespace margelo::nitro::salvedb
