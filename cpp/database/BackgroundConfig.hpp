#pragma once

namespace margelo::nitro::salvedb {

// Global background-sync schedule, set once via Database.configure({ background }).
struct BackgroundConfig {
  double minimumIntervalMs;
  bool requiresNetwork;
  bool requiresCharging;
};

} // namespace margelo::nitro::salvedb
