#pragma once

#include "HttpTypes.hpp"
#include <functional>

namespace margelo::nitro::salvedb {

// Thin contract over a per-platform HTTP stack; callback fires on the adapter's own thread, not the caller's.
class IHttpClient {
public:
  virtual void execute(const HttpRequest& request, std::function<void(HttpOutcome)> callback) = 0;
  virtual ~IHttpClient() = default;
};

} // namespace margelo::nitro::salvedb
