#pragma once

#include "HybridSalveDatabaseSpec.hpp"

namespace margelo::nitro::salvedb {

class HybridSalveDatabase: public HybridSalveDatabaseSpec {
public:
  HybridSalveDatabase(): HybridObject(TAG) {}

public:
  void configure(const std::string& configJson) override;
  std::shared_ptr<Promise<void>> registerSchema(const std::string& schemaJson) override;
};

} // namespace margelo::nitro::salvedb
