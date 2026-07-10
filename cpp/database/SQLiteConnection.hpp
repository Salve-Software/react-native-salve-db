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

  // Number of times a SQL string actually went through sqlite3_prepare_v2
  // (i.e. cache misses). Used to prove the LRU cache reuses prepared
  // statements instead of re-preparing on every call with the same SQL text.
  size_t prepareCount() const { return _prepareCount; }

private:
  sqlite3* _db = nullptr;
  bool _inTransaction = false;

  // LRU prepared statement cache (max 100 entries)
  static constexpr size_t kCacheCapacity = 100;
  std::list<std::pair<std::string, sqlite3_stmt*>> _lru;
  std::unordered_map<std::string, decltype(_lru)::iterator> _cache;
  size_t _prepareCount = 0;

  sqlite3_stmt* getOrPrepare(const std::string& sql);
  void evictLRU();
};

} // namespace margelo::nitro::salvedb
