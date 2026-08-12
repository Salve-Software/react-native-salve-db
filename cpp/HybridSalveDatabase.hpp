#pragma once

#include "HybridSalveDatabaseSpec.hpp"
#include "query/QueryExecutor.hpp"
#include "sync/SyncOrchestrator.hpp"
#include <vector>

namespace margelo::nitro::salvedb {

/**
 * The single Nitro-facing HybridObject exposed to JS — every JSI call from
 * `Database.*` lands here first. Owns configuration, schema registration,
 * raw SQL execution/transactions, sync triggers, and change notifications,
 * delegating the actual work to QueryExecutor and SyncOrchestrator.
 */
class HybridSalveDatabase: public HybridSalveDatabaseSpec {
public:
  HybridSalveDatabase(): HybridObject(TAG) {}
  ~HybridSalveDatabase() override;

public:
  void configure(const ConfigureParams& params) override;
  std::shared_ptr<Promise<void>> registerSchema(const std::string& schemaJson) override;
  std::shared_ptr<Promise<void>> reset() override;
  void logout() override;
  QueryResult execute(const std::string& sql, const std::vector<std::variant<nitro::NullType, bool, std::shared_ptr<ArrayBuffer>, std::string, double>>& params) override;
  void beginTransaction() override;
  void commit() override;
  void rollback() override;
  std::shared_ptr<Promise<std::optional<NativeSyncResult>>> triggerSync(const std::string& schemaName, bool discardIfBusy) override;
  std::shared_ptr<Promise<std::vector<NativeSyncResult>>> triggerSyncAll(bool discardIfBusy) override;
  double subscribeToChanges(const std::function<void(const std::vector<std::string>&)>& callback) override;
  void unsubscribeFromChanges(double id) override;
  double debugPreparedStatementCount() override;

private:
  QueryExecutor _queryExecutor;
  SyncOrchestrator _syncOrchestrator;
  std::vector<int> _ownedSubscriptionIds;
};

} // namespace margelo::nitro::salvedb
