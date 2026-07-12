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

  void open(const std::string& dbName);

  std::shared_ptr<SQLiteConnection> connection() const {
    if (!_db)
      throw std::runtime_error("Database not configured — call Database.configure() before any other operation.");
    return _db;
  }

  bool isOpen() const { return _db != nullptr; }

private:
  DatabaseManager() = default;
  std::shared_ptr<SQLiteConnection> _db;
};

} // namespace margelo::nitro::salvedb
