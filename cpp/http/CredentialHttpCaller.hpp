#pragma once

#include "../credentials/CredentialProvider.hpp"
#include "NetworkConfig.hpp"

namespace margelo::nitro::salvedb {

/**
 * Adapts the platform HTTP client to the `CredentialProvider::HttpCaller`
 * signature, so token refresh can issue real requests without CredentialProvider
 * depending on the HTTP layer directly.
 */
class CredentialHttpCaller {
public:
  // Builds a CredentialProvider::HttpCaller backed by the real HTTP client.
  // POST + Content-Type: application/json — the only shape refresh() sends.
  static CredentialProvider::HttpCaller create(const NetworkConfig& network);
};

} // namespace margelo::nitro::salvedb
