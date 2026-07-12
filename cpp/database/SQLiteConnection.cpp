#include "SQLiteConnection.hpp"
#include "SchemaRegistry.hpp"

#include <NitroModules/ArrayBuffer.hpp>
#include <stdexcept>
#include <string>

namespace margelo::nitro::salvedb {

SQLiteConnection::SQLiteConnection(const std::string& path) {
  int flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX;
  int rc = sqlite3_open_v2(path.c_str(), &_db, flags, nullptr);
  if (rc != SQLITE_OK) {
    std::string err = sqlite3_errmsg(_db);
    sqlite3_close(_db);
    _db = nullptr;
    throw std::runtime_error("SQLite open failed (" + path + "): " + err);
  }
  // WAL mode for concurrent read + write, busy timeout to avoid SQLITE_BUSY
  sqlite3_exec(_db, "PRAGMA journal_mode=WAL;", nullptr, nullptr, nullptr);
  sqlite3_exec(_db, "PRAGMA foreign_keys=ON;", nullptr, nullptr, nullptr);
  sqlite3_busy_timeout(_db, 5000);
  sqlite3_extended_result_codes(_db, 1); // makes prepare/step/exec return extended codes directly
  sqlite3_update_hook(_db, &SQLiteConnection::onSqliteUpdate, this);
}

namespace {

// Prefix is the only distinguishing signal that survives the JSI boundary (Nitro's
// generated glue collapses thrown exceptions down to a plain message string). Callers
// must read the primary code immediately after the failing call, before any other
// sqlite3 API touches the connection's error state.
std::string errorPrefix(int primaryCode) {
  switch (primaryCode) {
    case SQLITE_CONSTRAINT: return "SQLITE_CONSTRAINT: ";
    case SQLITE_BUSY:
    case SQLITE_LOCKED:     return "SQLITE_BUSY: ";
    default:                return "SQLITE_ERROR: ";
  }
}

} // namespace

SQLiteConnection::~SQLiteConnection() {
  std::lock_guard<std::mutex> lock(_mutex);

  // Best-effort rollback of a dangling transaction; can't throw from a destructor.
  if (_inTransaction && _db) {
    sqlite3_exec(_db, "ROLLBACK", nullptr, nullptr, nullptr);
  }

  if (_db) sqlite3_update_hook(_db, nullptr, nullptr);

  for (auto& [key, stmt] : _cache) {
    sqlite3_finalize(stmt->second);
  }
  _lru.clear();
  _cache.clear();
  if (_db) sqlite3_close(_db);
}

void SQLiteConnection::onSqliteUpdate(void* context, int /*op*/, const char* /*dbName*/, const char* table, sqlite3_int64 /*rowid*/) {
  auto* self = static_cast<SQLiteConnection*>(context);
  if (table) self->_touchedTables.insert(table);
}

sqlite3_stmt* SQLiteConnection::getOrPrepare(const std::string& sql) {
  auto it = _cache.find(sql);
  if (it != _cache.end()) {
    // Move to front (most recently used)
    _lru.splice(_lru.begin(), _lru, it->second);
    return it->second->second;
  }

  if (_lru.size() >= kCacheCapacity) evictLRU();

  sqlite3_stmt* stmt = nullptr;
  int rc = sqlite3_prepare_v2(_db, sql.c_str(), -1, &stmt, nullptr);
  if (rc != SQLITE_OK) {
    int primaryCode = sqlite3_extended_errcode(_db) & 0xff;
    throw std::runtime_error(errorPrefix(primaryCode) + "SQLite prepare error: " + sqlite3_errmsg(_db) + " — SQL: " + sql);
  }
  _prepareCount++;

  _lru.emplace_front(sql, stmt);
  _cache[sql] = _lru.begin();
  return stmt;
}

void SQLiteConnection::evictLRU() {
  if (_lru.empty()) return;
  auto last = std::prev(_lru.end());
  _cache.erase(last->first);
  sqlite3_finalize(last->second);
  _lru.erase(last);
}

QueryResult SQLiteConnection::execute(const std::string& sql, const std::vector<SqlValue>& params) {
  std::unique_lock<std::mutex> lock(_mutex);

  sqlite3_stmt* stmt = getOrPrepare(sql);
  sqlite3_reset(stmt);
  sqlite3_clear_bindings(stmt);

  for (int i = 0; i < (int)params.size(); ++i) {
    int col = i + 1;
    std::visit([&](auto&& v) {
      using T = std::decay_t<decltype(v)>;
      if constexpr (std::is_same_v<T, nitro::NullType>) {
        sqlite3_bind_null(stmt, col);
      } else if constexpr (std::is_same_v<T, bool>) {
        sqlite3_bind_int(stmt, col, v ? 1 : 0);
      } else if constexpr (std::is_same_v<T, double>) {
        sqlite3_bind_double(stmt, col, v);
      } else if constexpr (std::is_same_v<T, std::string>) {
        sqlite3_bind_text(stmt, col, v.c_str(), static_cast<int>(v.size()), SQLITE_TRANSIENT);
      } else if constexpr (std::is_same_v<T, std::shared_ptr<ArrayBuffer>>) {
        sqlite3_bind_blob(stmt, col, v->data(), static_cast<int>(v->size()), SQLITE_TRANSIENT);
      }
    }, params[i]);
  }

  std::vector<std::string> columns;
  std::vector<std::vector<SqlValue>> rows;
  std::vector<bool> isBoolCol;
  bool headerRead = false;
  int colCount = 0;

  int rc;
  while ((rc = sqlite3_step(stmt)) == SQLITE_ROW) {
    if (!headerRead) {
      colCount = sqlite3_column_count(stmt);
      columns.reserve(colCount);
      isBoolCol.reserve(colCount);
      for (int i = 0; i < colCount; ++i) {
        const char* name = sqlite3_column_name(stmt, i);
        columns.emplace_back(name ? name : "");

        // A column's origin table/name is fixed for the whole result set, so the
        // (mutex-guarded) registry lookup only needs to happen once per column, not per cell.
        const char* table  = sqlite3_column_table_name(stmt, i);
        const char* origin = sqlite3_column_origin_name(stmt, i);
        isBoolCol.push_back(table && origin && SchemaRegistry::shared().isBoolean(table, origin));
      }
      headerRead = true;
    }

    std::vector<SqlValue> row;
    row.reserve(colCount);
    for (int i = 0; i < colCount; ++i) {
      switch (sqlite3_column_type(stmt, i)) {
        case SQLITE_NULL:
          row.emplace_back(nitro::NullType{});
          break;
        case SQLITE_INTEGER: {
          int64_t intVal = sqlite3_column_int64(stmt, i);
          if (isBoolCol[i]) {
            row.emplace_back(intVal != 0);
          } else {
            row.emplace_back(static_cast<double>(intVal));
          }
          break;
        }
        case SQLITE_FLOAT:
          row.emplace_back(sqlite3_column_double(stmt, i));
          break;
        case SQLITE_TEXT: {
          const char* text = reinterpret_cast<const char*>(sqlite3_column_text(stmt, i));
          row.emplace_back(text ? std::string(text) : std::string{});
          break;
        }
        case SQLITE_BLOB: {
          const auto* data = static_cast<const uint8_t*>(sqlite3_column_blob(stmt, i));
          int sz = sqlite3_column_bytes(stmt, i);
          row.emplace_back(ArrayBuffer::copy(data, static_cast<size_t>(sz)));
          break;
        }
        default:
          // sqlite3_column_type only ever returns the 5 cases above per SQLite's docs.
          throw std::runtime_error("Unexpected SQLite column type");
      }
    }
    rows.push_back(std::move(row));
  }

  // Capture the failure's error state before reset()/clear_bindings() run, so a future
  // reordering of those calls can't silently make this read a stale/cleared code.
  bool failed = rc != SQLITE_DONE && rc != SQLITE_ROW;
  int primaryCode = failed ? (sqlite3_extended_errcode(_db) & 0xff) : 0;
  std::string errMsg = failed ? sqlite3_errmsg(_db) : std::string{};

  sqlite3_reset(stmt);
  sqlite3_clear_bindings(stmt);

  if (failed) {
    throw std::runtime_error(errorPrefix(primaryCode) + "SQLite execute error: " + errMsg);
  }

  QueryResult result{std::move(columns), std::move(rows)};
  if (!_inTransaction) flushChangeNotifications(lock);
  return result;
}

void SQLiteConnection::beginTransaction() {
  std::lock_guard<std::mutex> lock(_mutex);

  if (_inTransaction) {
    throw std::runtime_error("Nested transactions are not supported — commit() or rollback() first.");
  }
  execLocked("BEGIN");
  _inTransaction = true;
}

void SQLiteConnection::commit() {
  std::unique_lock<std::mutex> lock(_mutex);

  execLocked("COMMIT");
  _inTransaction = false;
  flushChangeNotifications(lock);
}

void SQLiteConnection::rollback() {
  std::lock_guard<std::mutex> lock(_mutex);

  execLocked("ROLLBACK");
  _inTransaction = false;
  // Discard without notifying — nothing in _touchedTables was actually persisted.
  _touchedTables.clear();
}

void SQLiteConnection::exec(const std::string& sql) {
  std::unique_lock<std::mutex> lock(_mutex);
  execLocked(sql);
  if (!_inTransaction) flushChangeNotifications(lock);
}

void SQLiteConnection::execLocked(const std::string& sql) {
  char* errMsg = nullptr;
  int rc = sqlite3_exec(_db, sql.c_str(), nullptr, nullptr, &errMsg);
  if (rc != SQLITE_OK) {
    int primaryCode = sqlite3_extended_errcode(_db) & 0xff;
    std::string err = errMsg ? errMsg : "unknown error";
    sqlite3_free(errMsg);
    throw std::runtime_error(errorPrefix(primaryCode) + "SQLite exec error: " + err + " — SQL: " + sql);
  }
}

void SQLiteConnection::flushChangeNotifications(std::unique_lock<std::mutex>& lock) {
  if (_touchedTables.empty()) return;

  std::vector<std::string> tables(_touchedTables.begin(), _touchedTables.end());
  _touchedTables.clear();

  std::vector<std::function<void(std::vector<std::string>)>> callbacks;
  callbacks.reserve(_subscribers.size());
  for (auto& [id, callback] : _subscribers) callbacks.push_back(callback);

  lock.unlock();
  for (auto& callback : callbacks) callback(tables);
}

int SQLiteConnection::subscribe(std::function<void(std::vector<std::string>)> callback) {
  std::lock_guard<std::mutex> lock(_mutex);
  int id = _nextSubscriberId++;
  _subscribers[id] = std::move(callback);
  return id;
}

void SQLiteConnection::unsubscribe(int id) {
  std::lock_guard<std::mutex> lock(_mutex);
  _subscribers.erase(id);
}

} // namespace margelo::nitro::salvedb
