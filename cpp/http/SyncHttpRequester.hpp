#pragma once

#include "SyncHttpCaller.hpp"
#include "../credentials/CredentialProvider.hpp"
#include <functional>

namespace margelo::nitro::salvedb {

// Owns the per-call retry budget (3x/5s) and the single transparent 401
// refresh. Never throws: a non-2xx status comes back as a normal
// SyncHttpResponse, and a HttpNetworkError comes back once the retry budget
// is exhausted — callers decide what either means.
class SyncHttpRequester {
public:
  SyncHttpRequester(CredentialProvider& credentials, const NetworkConfig& network);

  SyncHttpOutcome list(const SyncEndpoint& endpoint, int64_t sinceMs, int limit);
  SyncHttpOutcome create(const SyncEndpoint& endpoint, const json::Value& entity);
  SyncHttpOutcome update(const SyncEndpoint& endpoint, const std::string& id, const json::Value& entity);
  SyncHttpOutcome remove(const SyncEndpoint& endpoint, const std::string& id);

private:
  SyncHttpOutcome withRetryAnd401(const std::function<SyncHttpOutcome(const AuthHeader&)>& call);

  CredentialProvider& _credentials;
  NetworkConfig _network;
};

} // namespace margelo::nitro::salvedb
