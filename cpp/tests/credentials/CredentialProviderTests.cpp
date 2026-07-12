#include <catch2/catch_test_macros.hpp>
#include "../../credentials/CredentialProvider.hpp"
#include "../../platform/platform.hpp"

using namespace margelo::nitro::salvedb;

namespace {

// CredentialProvider uses fixed, global storage keys (MVP: single credential
// per app). Tests share one process-wide in-memory store (platform_test.cpp),
// so each test resets it first to avoid bleeding state into the next.
void resetSecureStore() {
  platform::deleteSecureValue("salvedb.credentials.accessToken");
  platform::deleteSecureValue("salvedb.credentials.refreshToken");
}

CredentialProvider makeProvider() {
  return CredentialProvider(
    "oauth2",
    "Authorization",
    "/auth/refresh",
    "$.accessToken",
    "$.refreshToken"
  );
}

} // namespace

TEST_CASE("getAuthHeader throws when no token has been seeded", "[credentials][CredentialProvider]") {
  resetSecureStore();
  auto provider = makeProvider();
  REQUIRE_THROWS_AS(provider.getAuthHeader(), std::runtime_error);
}

TEST_CASE("seedInitialTokens persists the token pair and getAuthHeader injects it", "[credentials][CredentialProvider]") {
  resetSecureStore();
  auto provider = makeProvider();

  provider.seedInitialTokens("access-abc", "refresh-abc");

  REQUIRE(provider.getAccessToken().value() == "access-abc");
  auto [headerName, headerValue] = provider.getAuthHeader();
  REQUIRE(headerName == "Authorization");
  REQUIRE(headerValue == "access-abc");
}

TEST_CASE("seedInitialTokens does not overwrite an already-persisted token", "[credentials][CredentialProvider]") {
  resetSecureStore();
  auto provider = makeProvider();

  provider.seedInitialTokens("access-1", "refresh-1");
  // Simulates a later configure() call on the same app install (e.g. app
  // restart) — the natively-refreshed token must survive, not be clobbered
  // by whatever the JS side passes into configure() again.
  provider.seedInitialTokens("access-2", "refresh-2");

  REQUIRE(provider.getAccessToken().value() == "access-1");
}

TEST_CASE("refresh throws when no refresh token is stored", "[credentials][CredentialProvider]") {
  resetSecureStore();
  auto provider = makeProvider();

  auto httpCaller = [](const std::string&, const json::Value&) -> RefreshHttpResponse {
    FAIL("httpCaller should not be called without a stored refresh token");
    return RefreshHttpResponse{500, json::Value(nullptr)};
  };

  REQUIRE_THROWS_AS(provider.refresh(httpCaller), std::runtime_error);
}

TEST_CASE("refresh sends the fixed refreshToken body and persists the new token pair", "[credentials][CredentialProvider]") {
  resetSecureStore();
  auto provider = makeProvider();
  provider.seedInitialTokens("access-old", "refresh-old");

  std::string capturedEndpoint;
  json::Value capturedBody;
  auto httpCaller = [&](const std::string& endpoint, const json::Value& body) -> RefreshHttpResponse {
    capturedEndpoint = endpoint;
    capturedBody = body;
    return RefreshHttpResponse{200, json::parse(R"({"accessToken": "access-new", "refreshToken": "refresh-new"})")};
  };

  provider.refresh(httpCaller);

  REQUIRE(capturedEndpoint == "/auth/refresh");
  REQUIRE(capturedBody.asObject().at("refreshToken").asString() == "refresh-old");
  REQUIRE(provider.getAccessToken().value() == "access-new");

  auto [headerName, headerValue] = provider.getAuthHeader();
  REQUIRE(headerName == "Authorization");
  REQUIRE(headerValue == "access-new");
}

TEST_CASE("refresh throws a clear error on non-2xx response and does not touch stored tokens", "[credentials][CredentialProvider]") {
  resetSecureStore();
  auto provider = makeProvider();
  provider.seedInitialTokens("access-old", "refresh-old");

  auto httpCaller = [](const std::string&, const json::Value&) -> RefreshHttpResponse {
    return RefreshHttpResponse{401, json::Value(nullptr)};
  };

  REQUIRE_THROWS_AS(provider.refresh(httpCaller), std::runtime_error);
  REQUIRE(provider.getAccessToken().value() == "access-old");
}

TEST_CASE("refresh throws a clear error when response is missing a JsonPath", "[credentials][CredentialProvider]") {
  resetSecureStore();
  auto provider = makeProvider();
  provider.seedInitialTokens("access-old", "refresh-old");

  auto httpCaller = [](const std::string&, const json::Value&) -> RefreshHttpResponse {
    return RefreshHttpResponse{200, json::parse(R"({"accessToken": "access-new"})")};
  };

  REQUIRE_THROWS_AS(provider.refresh(httpCaller), std::runtime_error);
  REQUIRE(provider.getAccessToken().value() == "access-old");
}
