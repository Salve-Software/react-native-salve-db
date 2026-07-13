#pragma once

#include "../credentials/CredentialProvider.hpp"
#include "NetworkConfig.hpp"

namespace margelo::nitro::salvedb {

class CredentialHttpCaller {
public:
  // Builds a CredentialProvider::HttpCaller backed by the real HTTP client.
  // POST + Content-Type: application/json — the only shape refresh() sends.
  static CredentialProvider::HttpCaller create(const NetworkConfig& network);
};

} // namespace margelo::nitro::salvedb
