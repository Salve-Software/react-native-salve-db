#include "CredentialProvider.hpp"
#include "../expression/JsonPathExtractor.hpp"
#include "../platform/platform.hpp"
#include <stdexcept>

namespace margelo::nitro::salvedb {

namespace {

// Fixed, global keys: MVP has exactly one credential pair per app install
// (no per-schema override), so there's nothing to namespace by.
const std::string kAccessTokenKey = "salvedb.credentials.accessToken";
const std::string kRefreshTokenKey = "salvedb.credentials.refreshToken";

} // namespace

CredentialProvider::CredentialProvider(
  std::string provider,
  std::string accessTokenHeaderName,
  std::string refreshEndpoint,
  std::string responseAccessTokenPath,
  std::string responseRefreshTokenPath
)
  : _provider(std::move(provider)),
    _accessTokenHeaderName(std::move(accessTokenHeaderName)),
    _refreshEndpoint(std::move(refreshEndpoint)),
    _responseAccessTokenPath(std::move(responseAccessTokenPath)),
    _responseRefreshTokenPath(std::move(responseRefreshTokenPath)) {}

void CredentialProvider::seedInitialTokens(const std::string& accessToken, const std::string& refreshToken) {
  bool alreadySeeded = platform::getSecureValue(kAccessTokenKey).has_value()
    && platform::getSecureValue(kRefreshTokenKey).has_value();
  if (alreadySeeded) return;

  platform::setSecureValue(kAccessTokenKey, accessToken);
  platform::setSecureValue(kRefreshTokenKey, refreshToken);
}

std::optional<std::string> CredentialProvider::getAccessToken() const {
  return platform::getSecureValue(kAccessTokenKey);
}

std::pair<std::string, std::string> CredentialProvider::getAuthHeader() const {
  auto token = getAccessToken();
  if (!token.has_value()) {
    throw std::runtime_error("CredentialProvider: no access token stored yet — call configure() with initial tokens first");
  }
  return {_accessTokenHeaderName, *token};
}

void CredentialProvider::refresh(const HttpCaller& httpCaller) {
  auto refreshToken = platform::getSecureValue(kRefreshTokenKey);
  if (!refreshToken.has_value()) {
    throw std::runtime_error("CredentialProvider: refresh requested but no refresh token is stored");
  }

  json::Object bodyObj;
  bodyObj["refreshToken"] = json::Value(*refreshToken);
  json::Value requestBody(std::move(bodyObj));

  RefreshHttpResponse response = httpCaller(_refreshEndpoint, requestBody);
  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw std::runtime_error(
      "CredentialProvider: refresh request failed with status " + std::to_string(response.statusCode)
    );
  }

  auto newAccessToken = JsonPathExtractor::extract(response.body, _responseAccessTokenPath);
  if (!newAccessToken.has_value() || !newAccessToken->isString()) {
    throw std::runtime_error(
      "CredentialProvider: refresh response missing accessToken at JsonPath \"" + _responseAccessTokenPath + "\""
    );
  }

  auto newRefreshToken = JsonPathExtractor::extract(response.body, _responseRefreshTokenPath);
  if (!newRefreshToken.has_value() || !newRefreshToken->isString()) {
    throw std::runtime_error(
      "CredentialProvider: refresh response missing refreshToken at JsonPath \"" + _responseRefreshTokenPath + "\""
    );
  }

  platform::setSecureValue(kAccessTokenKey, newAccessToken->asString());
  platform::setSecureValue(kRefreshTokenKey, newRefreshToken->asString());
}

} // namespace margelo::nitro::salvedb
