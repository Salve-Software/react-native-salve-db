#pragma once

#include "QueryResult.hpp"

#include <NitroModules/Null.hpp>
#include <NitroModules/ArrayBuffer.hpp>
#include <sqlite3.h>
#include <string>
#include <vector>
#include <list>
#include <set>
#include <unordered_map>
#include <functional>
#include <memory>
#include <mutex>

namespace margelo::nitro::salvedb {

using SqlValue = std::variant<nitro::NullType, bool, std::shared_ptr<ArrayBuffer>, std::string, double>;

class SQLiteConnection {
public:
  explicit SQLiteConnection(const std::string& path, bool walMode = true);
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

  // Subscribe to table-level change notifications (fires once per commit,
  // or once per statement outside an explicit transaction, listing every
  // table touched — coalesced, not per-row). Returns an id for unsubscribe().
  int subscribe(std::function<void(std::vector<std::string>)> callback);
  void unsubscribe(int id);

private:
  sqlite3* _db = nullptr;
  bool _inTransaction = false;

  std::mutex _mutex;

  // LRU prepared statement cache (max 100 entries)
  static constexpr size_t kCacheCapacity = 100;
  std::list<std::pair<std::string, sqlite3_stmt*>> _lru;
  std::unordered_map<std::string, decltype(_lru)::iterator> _cache;
  size_t _prepareCount = 0;

  std::set<std::string> _touchedTables;
  std::unordered_map<int, std::function<void(std::vector<std::string>)>> _subscribers;
  int _nextSubscriberId = 0;

  sqlite3_stmt* getOrPrepare(const std::string& sql);
  void evictLRU();
  void execLocked(const std::string& sql);

  void flushChangeNotifications(std::unique_lock<std::mutex>& lock);
  static void onSqliteUpdate(void* context, int op, const char* dbName, const char* table, sqlite3_int64 rowid);
};

} // namespace margelo::nitro::salvedb
