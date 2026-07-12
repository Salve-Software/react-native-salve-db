#pragma once

#include "../../nitrogen/generated/shared/c++/CredentialsParams.hpp"
#include <optional>
#include <string>

namespace margelo::nitro::salvedb {

class NetworkConfig {
public:
  static NetworkConfig& shared() {
    static NetworkConfig instance;
    return instance;
  }

  // Overwrites, does not merge with any previously stored values.
  void configure(std::optional<std::string> baseUrl,
                  std::optional<double> timeoutMs,
                  std::optional<CredentialsParams> credentials);

  std::optional<std::string> baseUrl() const { return _baseUrl; }
  std::optional<double> timeoutMs() const { return _timeoutMs; }
  std::optional<CredentialsParams> credentials() const { return _credentials; }

  const std::string& requireBaseUrl() const;
  double requireTimeoutMs() const;
  const CredentialsParams& requireCredentials() const;

private:
  NetworkConfig() = default;
  std::optional<std::string> _baseUrl;
  std::optional<double> _timeoutMs;
  std::optional<CredentialsParams> _credentials;
};

} // namespace margelo::nitro::salvedb
