#pragma once
#include <vector>
#include "HybridSalveDbSpec.hpp"

namespace margelo::nitro::salvedb {
class HybridSalveDb : public HybridSalveDbSpec {
    public:
        HybridSalveDb() : HybridObject(TAG), HybridSalveDbSpec() {}
       
        double sum(double a, double b) override;
    };
} // namespace margelo::nitro::salvedb
