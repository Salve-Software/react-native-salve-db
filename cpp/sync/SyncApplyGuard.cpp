#include "SyncApplyGuard.hpp"

namespace margelo::nitro::salvedb {

namespace {

class ApplyTransactionGuard {
public:
  explicit ApplyTransactionGuard(SQLiteConnection& conn) : _conn(conn) {
    _conn.beginTransaction();
  }

  ApplyTransactionGuard(const ApplyTransactionGuard&) = delete;
  ApplyTransactionGuard& operator=(const ApplyTransactionGuard&) = delete;

  ~ApplyTransactionGuard() {
    if (!_committed) {
      try {
        _conn.rollback();
      } catch (...) {
        // destructors must not throw
      }
    }
  }

  void commit() {
    _conn.commit();
    _committed = true;
  }

private:
  SQLiteConnection& _conn;
  bool _committed = false;
};

} // namespace

SyncApplyGuard::SyncApplyGuard(std::shared_ptr<SQLiteConnection> conn)
  : _conn(std::move(conn)) {}

void SyncApplyGuard::applyWithBypass(const std::function<void()>& fn) {
  ApplyTransactionGuard txn(*_conn);

  _conn->exec("INSERT OR IGNORE INTO _sync_apply_lock (id) VALUES (1)");

  fn();

  _conn->exec("DELETE FROM _sync_apply_lock");

  txn.commit();
}

} // namespace margelo::nitro::salvedb
