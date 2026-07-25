#pragma once

#include "HybridSalveDatabaseSpec.hpp"
#include "../query/QueryExecutor.hpp"
#include "../sync/SyncOrchestrator.hpp"

namespace margelo::nitro::salvedb {

class HybridSalveDatabase: public HybridSalveDatabaseSpec {
public:
  HybridSalveDatabase(): HybridObject(TAG) {}

public:
  void configure(const ConfigureParams& params) override;
  std::shared_ptr<Promise<void>> registerSchema(const std::string& schemaJson) override;
  QueryResult execute(const std::string& sql, const std::vector<std::variant<nitro::NullType, bool, std::shared_ptr<ArrayBuffer>, std::string, double>>& params) override;
  void beginTransaction() override;
  void commit() override;
  void rollback() override;
  std::shared_ptr<Promise<NativeSyncResult>> triggerSync(const std::string& schemaName) override;
  std::shared_ptr<Promise<std::vector<NativeSyncResult>>> triggerSyncAll(bool discardIfBusy) override;
  double subscribeToChanges(const std::function<void(const std::vector<std::string>&)>& callback) override;
  void unsubscribeFromChanges(double id) override;
  double debugPreparedStatementCount() override;

private:
  QueryExecutor _queryExecutor;
  SyncOrchestrator _syncOrchestrator;
};

} // namespace margelo::nitro::salvedb
