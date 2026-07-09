#pragma once

#include "SQLiteConnection.hpp"
#include <memory>
#include <stdexcept>

namespace margelo::nitro::salvedb {

class DatabaseManager {
public:
  static DatabaseManager& shared() {
    static DatabaseManager instance;
    return instance;
  }

  // Called by HybridSalveDatabase::configure()
  void open(const std::string& dbName);

  std::shared_ptr<SQLiteConnection> connection() const {
    if (!_connection)
      throw std::runtime_error("Database not configured — call Database.configure() before any other operation.");
    return _connection;
  }

  bool isOpen() const { return _connection != nullptr; }

private:
  DatabaseManager() = default;
  std::shared_ptr<SQLiteConnection> _connection;
};

} // namespace margelo::nitro::salvedb
