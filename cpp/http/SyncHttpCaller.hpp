#pragma once

#include "HttpTypes.hpp"
#include "NetworkConfig.hpp"
#include "../database/json_parser.hpp"
#include <utility>
#include <variant>

namespace margelo::nitro::salvedb {

struct SyncHttpResponse {
  int statusCode;
  json::Value body;
};

using SyncHttpOutcome = std::variant<SyncHttpResponse, HttpNetworkError>;

// Sends one sync-page request (arbitrary method/path/headers, from a schema's
// `endpoint` definition) over platform::httpExecute. No retry, no 401 handling —
// that's SyncOrchestrator's job; this is a single send.
class SyncHttpCaller {
public:
  static SyncHttpOutcome send(
    const json::Value& endpoint,
    const json::Value& body,
    const std::pair<std::string, std::string>& authHeader,
    const NetworkConfig& network
  );
};

} // namespace margelo::nitro::salvedb
