#pragma once

#include "HybridSalveQuerySpec.hpp"

namespace margelo::nitro::salvedb {

class HybridSalveQuery: public HybridSalveQuerySpec {
public:
  HybridSalveQuery(): HybridObject(TAG) {}

public:
  std::shared_ptr<Promise<QueryResult>> execute(const std::string& sql, const std::vector<std::variant<nitro::NullType, bool, std::shared_ptr<ArrayBuffer>, std::string, double>>& params) override;
  std::shared_ptr<Promise<void>> beginTransaction() override;
  std::shared_ptr<Promise<void>> commit() override;
  std::shared_ptr<Promise<void>> rollback() override;
};

} // namespace margelo::nitro::salvedb
