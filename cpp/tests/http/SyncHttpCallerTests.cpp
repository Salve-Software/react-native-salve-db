#include <catch2/catch_test_macros.hpp>
#include "../../http/SyncHttpCaller.hpp"
#include "../support/platform_test.hpp"

using namespace margelo::nitro::salvedb;

namespace {

NetworkConfig testNetwork() {
  return NetworkConfig{"https://api.company.com", 5000.0};
}

json::Value endpoint(const std::string& method, const std::string& path, const std::string& extraHeaders = "{}") {
  return json::parse(R"({"method": ")" + method + R"(", "path": ")" + path + R"(", "headers": )" + extraHeaders + "}");
}

} // namespace

TEST_CASE("builds method/URL/headers/body from the endpoint definition and auth header", "[http][SyncHttpCaller]") {
  HttpRequest captured;
  platform::test::setHttpExecuteResult([&](const HttpRequest& request) -> HttpOutcome {
    captured = request;
    return HttpResponse{200, {}, R"({"cursor": "abc"})"};
  });

  auto body = json::parse(R"({"cursor": null, "pageSize": 20})");
  auto outcome = SyncHttpCaller::send(endpoint("POST", "/sync/customers"), body, {"Authorization", "token-abc"}, testNetwork());

  REQUIRE(captured.method == HttpMethod::Post);
  REQUIRE(captured.url == "https://api.company.com/sync/customers");
  REQUIRE(captured.timeoutMs == 5000.0);
  REQUIRE(captured.body.has_value());
  REQUIRE(json::parse(*captured.body).getNumber("pageSize") == 20.0);

  bool hasAuth = false, hasContentType = false;
  for (auto& [name, value] : captured.headers) {
    if (name == "Authorization" && value == "token-abc") hasAuth = true;
    if (name == "Content-Type" && value == "application/json") hasContentType = true;
  }
  REQUIRE(hasAuth);
  REQUIRE(hasContentType);

  REQUIRE(std::holds_alternative<SyncHttpResponse>(outcome));
  REQUIRE(std::get<SyncHttpResponse>(outcome).statusCode == 200);
}

TEST_CASE("merges endpoint.headers into the request", "[http][SyncHttpCaller]") {
  HttpRequest captured;
  platform::test::setHttpExecuteResult([&](const HttpRequest& request) -> HttpOutcome {
    captured = request;
    return HttpResponse{200, {}, "{}"};
  });

  SyncHttpCaller::send(
    endpoint("GET", "/sync/customers", R"({"X-Tenant": "acme"})"),
    json::Value(nullptr), {"Authorization", "t"}, testNetwork()
  );

  bool hasTenant = false;
  for (auto& [name, value] : captured.headers) {
    if (name == "X-Tenant" && value == "acme") hasTenant = true;
  }
  REQUIRE(hasTenant);
  REQUIRE(captured.method == HttpMethod::Get);
}

TEST_CASE("maps every supported HTTP method", "[http][SyncHttpCaller]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{200, {}, "{}"};
  });

  auto sendWith = [&](const std::string& method) {
    return SyncHttpCaller::send(endpoint(method, "/x"), json::Value(nullptr), {"Authorization", "t"}, testNetwork());
  };

  REQUIRE_NOTHROW(sendWith("GET"));
  REQUIRE_NOTHROW(sendWith("POST"));
  REQUIRE_NOTHROW(sendWith("PUT"));
  REQUIRE_NOTHROW(sendWith("PATCH"));
  REQUIRE_NOTHROW(sendWith("DELETE"));
  REQUIRE_THROWS_AS(sendWith("TRACE"), std::runtime_error);
}

TEST_CASE("returns a network error as-is instead of throwing", "[http][SyncHttpCaller]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpNetworkError{HttpNetworkErrorKind::NoConnection, "no connection"};
  });

  auto outcome = SyncHttpCaller::send(endpoint("POST", "/sync/customers"), json::Value(nullptr), {"Authorization", "t"}, testNetwork());
  REQUIRE(std::holds_alternative<HttpNetworkError>(outcome));
}

TEST_CASE("throws a clear error when a response body is not valid JSON", "[http][SyncHttpCaller]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{200, {}, "<html>not json</html>"};
  });

  REQUIRE_THROWS_AS(
    SyncHttpCaller::send(endpoint("POST", "/sync/customers"), json::Value(nullptr), {"Authorization", "t"}, testNetwork()),
    std::runtime_error
  );
}

TEST_CASE("throws when endpoint.path is missing", "[http][SyncHttpCaller]") {
  REQUIRE_THROWS_AS(
    SyncHttpCaller::send(json::parse(R"({"method": "POST"})"), json::Value(nullptr), {"Authorization", "t"}, testNetwork()),
    std::runtime_error
  );
}
