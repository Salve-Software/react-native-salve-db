#pragma once

#include "QueryResult.hpp"

#include <NitroModules/Null.hpp>
#include <NitroModules/ArrayBuffer.hpp>
#include <sqlite3.h>
#include <string>
#include <vector>
#include <list>
#include <unordered_map>
#include <stdexcept>
#include <memory>

namespace margelo::nitro::salvedb {

using SqlValue = std::variant<nitro::NullType, bool, std::shared_ptr<ArrayBuffer>, std::string, double>;

class SQLiteConnection {
public:
  explicit SQLiteConnection(const std::string& path);
  ~SQLiteConnection();

  // Non-copyable, moveable
  SQLiteConnection(const SQLiteConnection&) = delete;
  SQLiteConnection& operator=(const SQLiteConnection&) = delete;

  QueryResult execute(const std::string& sql, const std::vector<SqlValue>& params);

  void beginTransaction();
  void commit();
  void rollback();

  // Utility: execute SQL without returning results (DDL, PRAGMA)
  void exec(const std::string& sql);

private:
  sqlite3* _db = nullptr;

  // LRU prepared statement cache (max 50 entries)
  static constexpr size_t kCacheCapacity = 50;
  std::list<std::pair<std::string, sqlite3_stmt*>> _lru;
  std::unordered_map<std::string, decltype(_lru)::iterator> _cache;

  sqlite3_stmt* getOrPrepare(const std::string& sql);
  void evictLRU();
};

} // namespace margelo::nitro::salvedb
