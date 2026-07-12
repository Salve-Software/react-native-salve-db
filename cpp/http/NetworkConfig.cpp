#include "NetworkConfig.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

void NetworkConfig::configure(std::optional<std::string> baseUrl,
                               std::optional<double> timeoutMs,
                               std::optional<CredentialsParams> credentials) {
  _baseUrl = std::move(baseUrl);
  _timeoutMs = timeoutMs;
  _credentials = std::move(credentials);
}

const std::string& NetworkConfig::requireBaseUrl() const {
  if (!_baseUrl)
    throw std::runtime_error("Database.configure() was called without 'baseUrl' — required for sync operations");
  return *_baseUrl;
}

double NetworkConfig::requireTimeoutMs() const {
  if (!_timeoutMs)
    throw std::runtime_error("Database.configure() was called without 'network.timeout' — required for sync operations");
  return *_timeoutMs;
}

const CredentialsParams& NetworkConfig::requireCredentials() const {
  if (!_credentials)
    throw std::runtime_error("Database.configure() was called without 'credentials' — required for sync operations");
  return *_credentials;
}

} // namespace margelo::nitro::salvedb
