#include <catch2/catch_test_macros.hpp>
#include "../../http/CredentialHttpCaller.hpp"
#include "../support/platform_test.hpp"

using namespace margelo::nitro::salvedb;

namespace {

NetworkConfig testNetwork() {
  return NetworkConfig{"https://api.company.com", 5000.0};
}

} // namespace

TEST_CASE("builds the request URL, method and Content-Type from NetworkConfig", "[http][CredentialHttpCaller]") {
  HttpRequest captured;
  platform::test::setHttpExecuteResult([&](const HttpRequest& request) -> HttpOutcome {
    captured = request;
    return HttpResponse{200, {}, R"({"accessToken": "a", "refreshToken": "r"})"};
  });

  auto caller = CredentialHttpCaller::create(testNetwork());
  caller("/auth/refresh", json::parse(R"({"refreshToken": "old"})"));

  REQUIRE(captured.method == HttpMethod::Post);
  REQUIRE(captured.url == "https://api.company.com/auth/refresh");
  REQUIRE(captured.timeoutMs == 5000.0);
  REQUIRE(captured.headers.size() == 1);
  REQUIRE(captured.headers[0] == std::make_pair(std::string("Content-Type"), std::string("application/json")));
  REQUIRE(captured.body.has_value());
  REQUIRE(json::parse(*captured.body).getString("refreshToken") == "old");
}

TEST_CASE("returns a RefreshHttpResponse with the parsed body on success", "[http][CredentialHttpCaller]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{200, {}, R"({"accessToken": "new-access", "refreshToken": "new-refresh"})"};
  });

  auto caller = CredentialHttpCaller::create(testNetwork());
  auto response = caller("/auth/refresh", json::parse(R"({"refreshToken": "old"})"));

  REQUIRE(response.statusCode == 200);
  REQUIRE(response.body.getString("accessToken") == "new-access");
}

TEST_CASE("propagates a non-2xx status as a RefreshHttpResponse, not an exception", "[http][CredentialHttpCaller]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{401, {}, R"({"error": "invalid refresh token"})"};
  });

  auto caller = CredentialHttpCaller::create(testNetwork());
  auto response = caller("/auth/refresh", json::parse(R"({"refreshToken": "old"})"));

  REQUIRE(response.statusCode == 401);
}

TEST_CASE("throws when the transport fails with a network error", "[http][CredentialHttpCaller]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpNetworkError{HttpNetworkErrorKind::NoConnection, "no connection"};
  });

  auto caller = CredentialHttpCaller::create(testNetwork());
  REQUIRE_THROWS_AS(caller("/auth/refresh", json::parse(R"({"refreshToken": "old"})")), std::runtime_error);
}

TEST_CASE("throws a clear error when a non-2xx response has a non-JSON body", "[http][CredentialHttpCaller]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{500, {}, "<html>Internal Server Error</html>"};
  });

  auto caller = CredentialHttpCaller::create(testNetwork());
  REQUIRE_THROWS_AS(caller("/auth/refresh", json::parse(R"({"refreshToken": "old"})")), std::runtime_error);
}

TEST_CASE("throws a clear error when a non-2xx response has an empty body", "[http][CredentialHttpCaller]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{502, {}, ""};
  });

  auto caller = CredentialHttpCaller::create(testNetwork());
  REQUIRE_THROWS_AS(caller("/auth/refresh", json::parse(R"({"refreshToken": "old"})")), std::runtime_error);
}
