#pragma once

#include "HybridSalveSyncSpec.hpp"

namespace margelo::nitro::salvedb {

class HybridSalveSync: public HybridSalveSyncSpec {
public:
  HybridSalveSync(): HybridObject(TAG) {}

public:
  std::shared_ptr<Promise<NativeSyncResult>> triggerSync(const std::string& schemaName) override;
};

} // namespace margelo::nitro::salvedb
