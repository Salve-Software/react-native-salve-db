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
  std::shared_ptr<Promise<QueryResult>> execute(const std::string& sql, const std::vector<std::variant<nitro::NullType, bool, std::shared_ptr<ArrayBuffer>, std::string, double>>& params) override;
  std::shared_ptr<Promise<void>> beginTransaction() override;
  std::shared_ptr<Promise<void>> commit() override;
  std::shared_ptr<Promise<void>> rollback() override;
  std::shared_ptr<Promise<NativeSyncResult>> triggerSync(const std::string& schemaName) override;
  double debugPreparedStatementCount() override;

private:
  QueryExecutor _queryExecutor;
  SyncOrchestrator _syncOrchestrator;
};

} // namespace margelo::nitro::salvedb
