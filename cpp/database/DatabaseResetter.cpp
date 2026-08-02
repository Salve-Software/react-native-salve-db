#include "DatabaseResetter.hpp"
#include "DatabaseManager.hpp"
#include "NativeConfigStore.hpp"
#include "SchemaRegistry.hpp"
#include "SQLiteConnection.hpp"
#include "../credentials/CredentialProvider.hpp"
#include "../sync/SyncApplyGuard.hpp"

#include <array>
#include <exception>

namespace margelo::nitro::salvedb {

namespace {

class TransactionGuard {
public:
  explicit TransactionGuard(SQLiteConnection& conn) : _conn(conn) { _conn.beginTransaction(); }

  TransactionGuard(const TransactionGuard&) = delete;
  TransactionGuard& operator=(const TransactionGuard&) = delete;

  ~TransactionGuard() {
    if (!_committed) {
      try { _conn.rollback(); } catch (...) {}
    }
  }

  void commit() { _conn.commit(); _committed = true; }

private:
  SQLiteConnection& _conn;
  bool _committed = false;
};

// _sync_apply_lock is excluded — SyncApplyGuard::applyWithBypass owns that row's lifecycle itself.
constexpr std::array<const char*, 6> kInternalSyncTables = {
  "sync_queue",
  "_salve_sync_cursors",
  "_salve_sync_definitions",
  "_salve_sync_metadata",
  "_salve_schema_versions",
  "_salve_relations",
};

// Internal sync tables (and any sync trigger) only exist once the first registerSchema() call has run.
bool syncTablesExist(SQLiteConnection& conn) {
  auto result = conn.execute(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = '_sync_apply_lock'", {}
  );
  return !result.rows.empty();
}

// Discovered via sqlite_master, not SchemaRegistry — that only reflects schemas registered this process session.
std::vector<std::string> domainTables(SQLiteConnection& conn) {
  auto result = conn.execute(
    "SELECT name FROM sqlite_master WHERE type = 'table' "
    "AND name NOT LIKE 'sqlite_%' "
    "AND name NOT LIKE '\\_salve%' ESCAPE '\\' "
    "AND name NOT IN ('sync_queue', '_sync_apply_lock')",
    {}
  );

  std::vector<std::string> tables;
  tables.reserve(result.rows.size());
  for (auto& row : result.rows) {
    if (!row.empty() && std::holds_alternative<std::string>(row[0])) {
      tables.push_back(std::get<std::string>(row[0]));
    }
  }
  return tables;
}

std::string quoteIdentifier(const std::string& name) {
  std::string escaped;
  for (char c : name) {
    if (c == '"') escaped += '"';
    escaped += c;
  }
  return "\"" + escaped + "\"";
}

} // namespace

void DatabaseResetter::reset() {
  auto& manager = DatabaseManager::shared();

  if (!manager.isOpen()) {
    SchemaRegistry::shared().clear();
    CredentialProvider::clearStoredTokens();
    manager.resetConfig();
    NativeConfigStore::remove();
    return;
  }

  auto conn = manager.connection();
  auto tables = domainTables(*conn);

  auto wipeDomainTables = [&]() {
    for (const auto& table : tables) {
      conn->exec("DELETE FROM " + quoteIdentifier(table));
    }
  };

  std::exception_ptr wipeError;
  try {
    if (syncTablesExist(*conn)) {
      // Sync triggers can only exist if registerSchema() ran, i.e. exactly when _sync_apply_lock exists.
      SyncApplyGuard(conn).applyWithBypass([&]() {
        wipeDomainTables();
        for (const char* table : kInternalSyncTables) {
          conn->exec(std::string("DELETE FROM ") + table);
        }
      });
    } else if (!tables.empty()) {
      TransactionGuard txn(*conn);
      wipeDomainTables();
      txn.commit();
    }
  } catch (...) {
    wipeError = std::current_exception();
  }

  // Cleared unconditionally even if the wipe above threw — sign-out must not depend on it; wipeError still propagates below.
  SchemaRegistry::shared().clear();
  CredentialProvider::clearStoredTokens();
  manager.resetConfig();
  NativeConfigStore::remove();

  if (wipeError) std::rethrow_exception(wipeError);
}

} // namespace margelo::nitro::salvedb
