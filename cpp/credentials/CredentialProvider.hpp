#pragma once

#include "../database/json_parser.hpp"
#include <functional>
#include <optional>
#include <string>
#include <utility>

namespace margelo::nitro::salvedb {

// Result of calling the refresh endpoint. The HTTP call itself is injected
// by the caller — this struct is the seam CredentialProvider needs from it.
struct RefreshHttpResponse {
  int statusCode;
  json::Value body;
};

// Single global credential (MVP: no per-schema override). Owns the
// Keychain/Keystore-backed token pair and the native refresh flow. Tokens
// never cross the JSI bridge — nothing here is exposed to JS.
class CredentialProvider {
public:
  using HttpCaller = std::function<RefreshHttpResponse(const std::string& endpoint, const json::Value& requestBody)>;

  CredentialProvider(
    std::string provider,
    std::string accessTokenHeaderName,
    std::string refreshEndpoint,
    std::string responseAccessTokenPath,
    std::string responseRefreshTokenPath
  );

  // Seeds the token pair obtained by the app's own login flow. No-op if a
  // token pair is already persisted (e.g. configure() called again on a
  // later app launch) — never overwrites a token natively refreshed since.
  void seedInitialTokens(const std::string& accessToken, const std::string& refreshToken);

  // Current access token, or nullopt if none was ever seeded/refreshed.
  std::optional<std::string> getAccessToken() const;

  // {headerName, accessToken} ready to inject into a sync request header.
  // Throws if no access token has been seeded yet.
  std::pair<std::string, std::string> getAuthHeader() const;

  // Runs the native refresh flow: builds a fixed {"refreshToken": "<value>"}
  // body, calls httpCaller against refresh.endpoint, extracts the new token
  // pair via JsonPath, and persists it. Throws a clear error — never
  // silently no-ops — if there's no refresh token stored, the call fails,
  // or the response is missing either JsonPath. Callers are expected to
  // let this propagate rather than swallow it.
  void refresh(const HttpCaller& httpCaller);

private:
  std::string _provider;
  std::string _accessTokenHeaderName;
  std::string _refreshEndpoint;
  std::string _responseAccessTokenPath;
  std::string _responseRefreshTokenPath;
};

} // namespace margelo::nitro::salvedb
