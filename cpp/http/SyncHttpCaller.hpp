#pragma once

#include "HttpTypes.hpp"
#include "NetworkConfig.hpp"
#include "../database/json_parser.hpp"
#include "../sync/SyncContract.hpp"
#include <cstdint>
#include <utility>
#include <variant>

namespace margelo::nitro::salvedb {

struct SyncHttpResponse {
  int statusCode;
  json::Value body;
};

using SyncHttpOutcome = std::variant<SyncHttpResponse, HttpNetworkError>;
using AuthHeader = std::pair<std::string, std::string>;

// One REST call per verb of the entity-module contract (#84). No retry, no
// 401 handling — that's SyncHttpRequester's job; this is a single send.
class SyncHttpCaller {
public:
  static SyncHttpOutcome list(const SyncEndpoint& endpoint, int64_t sinceMs, int limit,
                               const AuthHeader& authHeader, const NetworkConfig& network);
  static SyncHttpOutcome create(const SyncEndpoint& endpoint, const json::Value& entity,
                                 const AuthHeader& authHeader, const NetworkConfig& network);
  static SyncHttpOutcome update(const SyncEndpoint& endpoint, const std::string& id, const json::Value& entity,
                                 const AuthHeader& authHeader, const NetworkConfig& network);
  static SyncHttpOutcome remove(const SyncEndpoint& endpoint, const std::string& id,
                                 const AuthHeader& authHeader, const NetworkConfig& network);

  // Old batched-protocol send, kept only until SyncOrchestrator's rewrite lands.
  static SyncHttpOutcome send(
    const json::Value& endpoint,
    const json::Value& body,
    const std::pair<std::string, std::string>& authHeader,
    const NetworkConfig& network
  );
};

} // namespace margelo::nitro::salvedb
