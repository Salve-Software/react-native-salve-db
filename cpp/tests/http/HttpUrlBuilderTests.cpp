#include <catch2/catch_test_macros.hpp>
#include "../../http/HttpUrlBuilder.hpp"

using namespace margelo::nitro::salvedb;

TEST_CASE("joins baseUrl without trailing slash and path with leading slash", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.company.com", "/customers") == "https://api.company.com/customers");
}

TEST_CASE("collapses a doubled slash when both sides have one", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.company.com/", "/customers") == "https://api.company.com/customers");
}

TEST_CASE("inserts a slash when neither side has one", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.company.com", "customers") == "https://api.company.com/customers");
}

TEST_CASE("joins baseUrl with trailing slash and path without leading slash", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.company.com/", "customers") == "https://api.company.com/customers");
}

TEST_CASE("returns baseUrl unchanged for an empty path", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.company.com", "") == "https://api.company.com");
  REQUIRE(HttpUrlBuilder::build("https://api.company.com/", "") == "https://api.company.com");
}

TEST_CASE("preserves nested paths", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.company.com", "/v1/customers/42") == "https://api.company.com/v1/customers/42");
}

TEST_CASE("collapses multiple trailing slashes on baseUrl", "[http][HttpUrlBuilder]") {
  REQUIRE(HttpUrlBuilder::build("https://api.company.com//", "/customers") == "https://api.company.com/customers");
  REQUIRE(HttpUrlBuilder::build("https://api.company.com///", "customers") == "https://api.company.com/customers");
}
