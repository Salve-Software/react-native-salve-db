#include <catch2/catch_test_macros.hpp>
#include "../../http/NetworkConfig.hpp"

using namespace margelo::nitro::salvedb;

namespace {

CredentialsParams sampleCredentials() {
  return CredentialsParams(
    "oauth2",
    "Authorization",
    RefreshParams("/auth/refresh", "$.accessToken", "$.refreshToken")
  );
}

} // namespace

TEST_CASE("configure() stores baseUrl, timeout and credentials", "[http][NetworkConfig]") {
  NetworkConfig::shared().configure("https://api.x.com", 5000.0, sampleCredentials());

  REQUIRE(NetworkConfig::shared().baseUrl() == "https://api.x.com");
  REQUIRE(NetworkConfig::shared().timeoutMs() == 5000.0);
  REQUIRE(NetworkConfig::shared().credentials()->provider == "oauth2");

  REQUIRE(NetworkConfig::shared().requireBaseUrl() == "https://api.x.com");
  REQUIRE(NetworkConfig::shared().requireTimeoutMs() == 5000.0);
  REQUIRE(NetworkConfig::shared().requireCredentials().provider == "oauth2");
}

TEST_CASE("configure() without sync fields leaves optional getters empty and require* throws", "[http][NetworkConfig]") {
  NetworkConfig::shared().configure(std::nullopt, std::nullopt, std::nullopt);

  REQUIRE_FALSE(NetworkConfig::shared().baseUrl().has_value());
  REQUIRE_FALSE(NetworkConfig::shared().timeoutMs().has_value());
  REQUIRE_FALSE(NetworkConfig::shared().credentials().has_value());

  REQUIRE_THROWS(NetworkConfig::shared().requireBaseUrl());
  REQUIRE_THROWS(NetworkConfig::shared().requireTimeoutMs());
  REQUIRE_THROWS(NetworkConfig::shared().requireCredentials());
}

TEST_CASE("configure() overwrites previous values instead of merging", "[http][NetworkConfig]") {
  NetworkConfig::shared().configure("https://old.x.com", 1000.0, sampleCredentials());
  NetworkConfig::shared().configure("https://new.x.com", 2000.0, std::nullopt);

  REQUIRE(NetworkConfig::shared().baseUrl() == "https://new.x.com");
  REQUIRE(NetworkConfig::shared().timeoutMs() == 2000.0);
  REQUIRE_FALSE(NetworkConfig::shared().credentials().has_value());
}
