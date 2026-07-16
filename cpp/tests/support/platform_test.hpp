#pragma once

#include "../../http/HttpTypes.hpp"
#include <functional>

namespace margelo::nitro::salvedb::platform::test {

// Test-only hook: configures what httpExecute() returns. Must be set before
// code under test calls platform::httpExecute.
void setHttpExecuteResult(std::function<HttpOutcome(const HttpRequest&)> handler);

// Test-only hook: how many times scheduleBackgroundSync() has been called.
int& scheduleBackgroundSyncCallCount();

} // namespace margelo::nitro::salvedb::platform::test
