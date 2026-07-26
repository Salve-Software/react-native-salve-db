#include "SyncHttpRequester.hpp"
#include "CredentialHttpCaller.hpp"
#include <chrono>
#include <thread>
#include <variant>

namespace margelo::nitro::salvedb {

namespace {
constexpr int kMaxAttempts = 3;
constexpr std::chrono::milliseconds kRetryDelay{5000};
} // namespace

SyncHttpRequester::SyncHttpRequester(CredentialProvider& credentials, const NetworkConfig& network)
  : _credentials(credentials), _network(network) {}

SyncHttpOutcome SyncHttpRequester::withRetryAnd401(const std::function<SyncHttpOutcome(const AuthHeader&)>& call) {
  try {
    bool refreshed = false;
    int failedAttempts = 0; // counts only genuine network failures — a 401 refresh never touches this
    while (true) {
      auto authHeader = _credentials.getAuthHeader();
      SyncHttpOutcome outcome = call(authHeader);

      if (auto* error = std::get_if<HttpNetworkError>(&outcome)) {
        ++failedAttempts;
        if (failedAttempts < kMaxAttempts) {
          std::this_thread::sleep_for(kRetryDelay);
          continue;
        }
        return *error;
      }

      auto& response = std::get<SyncHttpResponse>(outcome);
      if (response.statusCode == 401 && !refreshed) {
        refreshed = true;
        _credentials.refresh(CredentialHttpCaller::create(_network));
        continue; // reexecute — does not consume a retry attempt
      }
      return response;
    }
  } catch (const std::exception& e) {
    // Credential lookup/refresh can throw — keeps the "never throws" contract for callers.
    return HttpNetworkError{HttpNetworkErrorKind::Other, e.what()};
  }
}

SyncHttpOutcome SyncHttpRequester::list(const SyncEndpoint& endpoint, int64_t sinceMs, int limit) {
  return withRetryAnd401([&](const AuthHeader& auth) {
    return SyncHttpCaller::list(endpoint, sinceMs, limit, auth, _network);
  });
}

SyncHttpOutcome SyncHttpRequester::create(const SyncEndpoint& endpoint, const json::Value& entity) {
  return withRetryAnd401([&](const AuthHeader& auth) {
    return SyncHttpCaller::create(endpoint, entity, auth, _network);
  });
}

SyncHttpOutcome SyncHttpRequester::update(const SyncEndpoint& endpoint, const std::string& id, const json::Value& entity) {
  return withRetryAnd401([&](const AuthHeader& auth) {
    return SyncHttpCaller::update(endpoint, id, entity, auth, _network);
  });
}

SyncHttpOutcome SyncHttpRequester::remove(const SyncEndpoint& endpoint, const std::string& id) {
  return withRetryAnd401([&](const AuthHeader& auth) {
    return SyncHttpCaller::remove(endpoint, id, auth, _network);
  });
}

} // namespace margelo::nitro::salvedb
