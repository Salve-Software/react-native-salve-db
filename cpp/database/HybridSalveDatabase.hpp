#pragma once

#include "HybridSalveDatabaseSpec.hpp"
#include "IQueryResult.hpp"
#include "INativeSyncResult.hpp"

namespace margelo::nitro::salvedb {

class HybridSalveDatabase: public HybridSalveDatabaseSpec {
public:
  HybridSalveDatabase(): HybridObject(TAG) {}

public:
  void configure(const IConfigureParams& params) override;
  std::shared_ptr<Promise<void>> registerSchema(const std::string& schemaJson) override;
  std::shared_ptr<Promise<IQueryResult>> execute(const std::string& sql, const std::vector<std::variant<nitro::NullType, bool, std::shared_ptr<ArrayBuffer>, std::string, double>>& params) override;
  std::shared_ptr<Promise<void>> beginTransaction() override;
  std::shared_ptr<Promise<void>> commit() override;
  std::shared_ptr<Promise<void>> rollback() override;
  std::shared_ptr<Promise<INativeSyncResult>> triggerSync(const std::string& schemaName) override;
};

} // namespace margelo::nitro::salvedb
