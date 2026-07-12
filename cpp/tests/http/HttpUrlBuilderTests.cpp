#include <catch2/catch_test_macros.hpp>
#include "../../http/HttpUrlBuilder.hpp"

using namespace margelo::nitro::salvedb;

TEST_CASE("normalizes a missing leading slash on path", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.x.com", "users") == "https://api.x.com/users");
}

TEST_CASE("normalizes a trailing slash on baseUrl", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.x.com/", "/users") == "https://api.x.com/users");
}

TEST_CASE("normalizes both a trailing baseUrl slash and a missing path slash", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.x.com/", "users") == "https://api.x.com/users");
}

TEST_CASE("leaves an already-correct baseUrl+path pair untouched", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.x.com", "/users") == "https://api.x.com/users");
}

TEST_CASE("empty path returns baseUrl without a dangling slash", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.x.com/", "") == "https://api.x.com");
  REQUIRE(HttpUrlBuilder::build("https://api.x.com", "") == "https://api.x.com");
}

TEST_CASE("path of just a slash resolves to baseUrl root", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.x.com", "/") == "https://api.x.com/");
}

TEST_CASE("baseUrl already containing a sub-path is preserved", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.x.com/v1", "/users") == "https://api.x.com/v1/users");
}

TEST_CASE("internal double slashes inside path are preserved untouched", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.x.com", "/users//1") == "https://api.x.com/users//1");
}
