#include <catch2/catch_test_macros.hpp>
#include "../../http/SyncHttpRequester.hpp"
#include "../support/platform_test.hpp"

using namespace margelo::nitro::salvedb;

namespace {

CredentialProvider testCredentials() {
  CredentialProvider credentials("oauth2", "Authorization", "/auth/refresh", "$.accessToken", "$.refreshToken");
  credentials.seedInitialTokens("access-1", "refresh-1");
  return credentials;
}

SyncEndpoint testEndpoint() {
  return SyncEndpoint{"/customers", "updatedAfter", "limit", {}};
}

NetworkConfig testNetwork() {
  return NetworkConfig{"https://api.company.com", 5000.0};
}

} // namespace

// Real ~10s: 2 real 5s retry delays — no test-only override, to keep that
// hardcoded delay out of the production binary.
TEST_CASE("retries a network failure 3 times before giving up", "[http][SyncHttpRequester]") {
  int calls = 0;
  platform::test::setHttpExecuteResult([&](const HttpRequest&) -> HttpOutcome {
    ++calls;
    return HttpNetworkError{HttpNetworkErrorKind::NoConnection, "no connection"};
  });

  auto credentials = testCredentials();
  SyncHttpRequester requester(credentials, testNetwork());
  auto outcome = requester.list(testEndpoint(), 0, 20);

  REQUIRE(std::holds_alternative<HttpNetworkError>(outcome));
  REQUIRE(calls == 3);
}

TEST_CASE("refreshes the token on 401 and reexecutes the call", "[http][SyncHttpRequester]") {
  platform::test::setHttpExecuteResult([](const HttpRequest& request) -> HttpOutcome {
    if (request.url.find("/auth/refresh") != std::string::npos) {
      return HttpResponse{200, {}, R"({"accessToken": "access-2", "refreshToken": "refresh-2"})"};
    }
    std::string authHeader;
    for (auto& [name, value] : request.headers) {
      if (name == "Authorization") authHeader = value;
    }
    if (authHeader == "access-1") return HttpResponse{401, {}, "{}"};
    return HttpResponse{200, {}, "[]"};
  });

  auto credentials = testCredentials();
  SyncHttpRequester requester(credentials, testNetwork());
  auto outcome = requester.list(testEndpoint(), 0, 20);

  REQUIRE(std::holds_alternative<SyncHttpResponse>(outcome));
  REQUIRE(std::get<SyncHttpResponse>(outcome).statusCode == 200);
  REQUIRE(credentials.getAccessToken().value() == "access-2");
}

// Real ~10s — see the retry-exhaustion test above for why there's no override.
TEST_CASE("a 401 refresh does not eat into the retry budget for a subsequent network failure", "[http][SyncHttpRequester]") {
  int networkAttempts = 0;
  platform::test::setHttpExecuteResult([&](const HttpRequest& request) -> HttpOutcome {
    if (request.url.find("/auth/refresh") != std::string::npos) {
      return HttpResponse{200, {}, R"({"accessToken": "access-2", "refreshToken": "refresh-2"})"};
    }
    std::string authHeader;
    for (auto& [name, value] : request.headers) {
      if (name == "Authorization") authHeader = value;
    }
    if (authHeader == "access-1") return HttpResponse{401, {}, "{}"};
    ++networkAttempts;
    return HttpNetworkError{HttpNetworkErrorKind::NoConnection, "no connection"};
  });

  auto credentials = testCredentials();
  SyncHttpRequester requester(credentials, testNetwork());
  auto outcome = requester.list(testEndpoint(), 0, 20);

  REQUIRE(std::holds_alternative<HttpNetworkError>(outcome));
  REQUIRE(networkAttempts == 3);
}

TEST_CASE("a credential lookup failure comes back as HttpNetworkError, not a thrown exception", "[http][SyncHttpRequester]") {
  CredentialProvider credentials("oauth2", "Authorization", "/auth/refresh", "$.accessToken", "$.refreshToken");
  // No seedInitialTokens() call — getAuthHeader() throws with no token stored.
  SyncHttpRequester requester(credentials, testNetwork());

  auto outcome = requester.list(testEndpoint(), 0, 20);

  REQUIRE(std::holds_alternative<HttpNetworkError>(outcome));
}

TEST_CASE("a refresh failure comes back as HttpNetworkError, not a thrown exception", "[http][SyncHttpRequester]") {
  platform::test::setHttpExecuteResult([](const HttpRequest& request) -> HttpOutcome {
    if (request.url.find("/auth/refresh") != std::string::npos) {
      return HttpResponse{200, {}, R"({"unexpected": "shape"})"}; // missing accessToken/refreshToken
    }
    return HttpResponse{401, {}, "{}"};
  });

  auto credentials = testCredentials();
  SyncHttpRequester requester(credentials, testNetwork());
  auto outcome = requester.list(testEndpoint(), 0, 20);

  REQUIRE(std::holds_alternative<HttpNetworkError>(outcome));
}

TEST_CASE("a non-2xx response is returned as a value, not thrown", "[http][SyncHttpRequester]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{404, {}, "{}"};
  });

  auto credentials = testCredentials();
  SyncHttpRequester requester(credentials, testNetwork());
  auto outcome = requester.remove(testEndpoint(), "1");

  REQUIRE(std::holds_alternative<SyncHttpResponse>(outcome));
  REQUIRE(std::get<SyncHttpResponse>(outcome).statusCode == 404);
}
