#pragma once

#include <stdexcept>
#include <string>

namespace margelo::nitro::salvedb {

// Distinguishes a proven-dead network from any other session failure, so
// triggerSyncAll can stop iterating remaining schemas instead of retrying
// each one against a connection that already failed.
class SyncNetworkFailure : public std::runtime_error {
public:
  explicit SyncNetworkFailure(const std::string& message) : std::runtime_error(message) {}
};

} // namespace margelo::nitro::salvedb
