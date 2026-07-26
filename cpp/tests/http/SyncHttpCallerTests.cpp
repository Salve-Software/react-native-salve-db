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

SyncEndpoint restEndpoint() {
  return SyncEndpoint{"/customers", "updatedAfter", "limit", {}};
}

AuthHeader authHeader() { return {"Authorization", "token-abc"}; }

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

TEST_CASE("preserves the status code instead of throwing when a non-2xx response has a non-JSON body", "[http][SyncHttpCaller]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{401, {}, "<html>Unauthorized</html>"};
  });

  auto outcome = SyncHttpCaller::send(endpoint("POST", "/sync/customers"), json::Value(nullptr), {"Authorization", "t"}, testNetwork());

  REQUIRE(std::holds_alternative<SyncHttpResponse>(outcome));
  REQUIRE(std::get<SyncHttpResponse>(outcome).statusCode == 401);
}

TEST_CASE("throws when endpoint.path is missing", "[http][SyncHttpCaller]") {
  REQUIRE_THROWS_AS(
    SyncHttpCaller::send(json::parse(R"({"method": "POST"})"), json::Value(nullptr), {"Authorization", "t"}, testNetwork()),
    std::runtime_error
  );
}

TEST_CASE("list builds a GET with sinceParam/limitParam query and no body", "[http][SyncHttpCaller]") {
  HttpRequest captured;
  platform::test::setHttpExecuteResult([&](const HttpRequest& request) -> HttpOutcome {
    captured = request;
    return HttpResponse{200, {}, "[]"};
  });

  SyncHttpCaller::list(restEndpoint(), 1700, 50, authHeader(), testNetwork());

  REQUIRE(captured.method == HttpMethod::Get);
  REQUIRE(captured.url == "https://api.company.com/customers?updatedAfter=1700&limit=50");
  REQUIRE_FALSE(captured.body.has_value());
}

TEST_CASE("create builds a POST to basePath with the entity as body", "[http][SyncHttpCaller]") {
  HttpRequest captured;
  platform::test::setHttpExecuteResult([&](const HttpRequest& request) -> HttpOutcome {
    captured = request;
    return HttpResponse{201, {}, R"({"id": "1"})"};
  });

  SyncHttpCaller::create(restEndpoint(), json::parse(R"({"name": "alice"})"), authHeader(), testNetwork());

  REQUIRE(captured.method == HttpMethod::Post);
  REQUIRE(captured.url == "https://api.company.com/customers");
  REQUIRE(captured.body.has_value());
  REQUIRE(json::parse(*captured.body).getString("name") == "alice");
}

TEST_CASE("update builds a PATCH with the id in the route, percent-encoded", "[http][SyncHttpCaller]") {
  HttpRequest captured;
  platform::test::setHttpExecuteResult([&](const HttpRequest& request) -> HttpOutcome {
    captured = request;
    return HttpResponse{200, {}, R"({"id": "1"})"};
  });

  SyncHttpCaller::update(restEndpoint(), "a/b", json::parse(R"({"name": "alice"})"), authHeader(), testNetwork());

  REQUIRE(captured.method == HttpMethod::Patch);
  REQUIRE(captured.url == "https://api.company.com/customers/a%2Fb");
}

TEST_CASE("remove builds a DELETE with the id in the route and no body", "[http][SyncHttpCaller]") {
  HttpRequest captured;
  platform::test::setHttpExecuteResult([&](const HttpRequest& request) -> HttpOutcome {
    captured = request;
    return HttpResponse{204, {}, ""};
  });

  SyncHttpCaller::remove(restEndpoint(), "1", authHeader(), testNetwork());

  REQUIRE(captured.method == HttpMethod::Delete);
  REQUIRE(captured.url == "https://api.company.com/customers/1");
  REQUIRE_FALSE(captured.body.has_value());
}

TEST_CASE("endpoint.extraHeaders are merged into every verb's request", "[http][SyncHttpCaller]") {
  HttpRequest captured;
  platform::test::setHttpExecuteResult([&](const HttpRequest& request) -> HttpOutcome {
    captured = request;
    return HttpResponse{200, {}, "[]"};
  });

  SyncEndpoint endpointWithHeader{"/customers", "updatedAfter", "limit", {{"X-Tenant", "acme"}}};
  SyncHttpCaller::list(endpointWithHeader, 0, 50, authHeader(), testNetwork());

  bool hasTenant = false;
  for (auto& [name, value] : captured.headers) {
    if (name == "X-Tenant" && value == "acme") hasTenant = true;
  }
  REQUIRE(hasTenant);
}

TEST_CASE("204 No Content does not throw and yields a null body", "[http][SyncHttpCaller]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{204, {}, ""};
  });

  auto outcome = SyncHttpCaller::remove(restEndpoint(), "1", authHeader(), testNetwork());

  REQUIRE(std::holds_alternative<SyncHttpResponse>(outcome));
  auto& response = std::get<SyncHttpResponse>(outcome);
  REQUIRE(response.statusCode == 204);
  REQUIRE(response.body.isNull());
}

TEST_CASE("a 2xx response with an empty body does not throw", "[http][SyncHttpCaller]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{200, {}, "   "};
  });

  auto outcome = SyncHttpCaller::update(restEndpoint(), "1", json::parse("{}"), authHeader(), testNetwork());

  REQUIRE(std::holds_alternative<SyncHttpResponse>(outcome));
  REQUIRE(std::get<SyncHttpResponse>(outcome).body.isNull());
}

TEST_CASE("a 2xx response with a non-JSON body does not throw — yields a null body (L7)", "[http][SyncHttpCaller]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{201, {}, "<html>ok</html>"};
  });

  auto outcome = SyncHttpCaller::create(restEndpoint(), json::parse(R"({"name": "alice"})"), authHeader(), testNetwork());

  REQUIRE(std::holds_alternative<SyncHttpResponse>(outcome));
  auto& response = std::get<SyncHttpResponse>(outcome);
  REQUIRE(response.statusCode == 201);
  REQUIRE(response.body.isNull());
}

TEST_CASE("list() with a non-JSON body does not throw — yields a null body (L7)", "[http][SyncHttpCaller]") {
  platform::test::setHttpExecuteResult([](const HttpRequest&) -> HttpOutcome {
    return HttpResponse{200, {}, "not json at all"};
  });

  auto outcome = SyncHttpCaller::list(restEndpoint(), 0, 50, authHeader(), testNetwork());

  REQUIRE(std::holds_alternative<SyncHttpResponse>(outcome));
  REQUIRE(std::get<SyncHttpResponse>(outcome).body.isNull());
}
