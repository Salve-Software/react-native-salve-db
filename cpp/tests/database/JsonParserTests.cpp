#include <catch2/catch_test_macros.hpp>
#include "../../database/json_parser.hpp"
#include <limits>

using namespace margelo::nitro::salvedb;

TEST_CASE("stringify preserves fractional precision", "[json][stringify]") {
  double value = 1.0 / 3.0;
  auto serialized = json::stringify(json::Value(value));
  auto roundTripped = json::parse(serialized);
  REQUIRE(roundTripped.asNumber() == value);
}

TEST_CASE("stringify rejects NaN and Infinity", "[json][stringify]") {
  double nan = std::numeric_limits<double>::quiet_NaN();
  double inf = std::numeric_limits<double>::infinity();
  REQUIRE_THROWS_AS(json::stringify(json::Value(nan)), std::runtime_error);
  REQUIRE_THROWS_AS(json::stringify(json::Value(inf)), std::runtime_error);
}

TEST_CASE("stringify still prints integral doubles without a decimal point", "[json][stringify]") {
  REQUIRE(json::stringify(json::Value(42.0)) == "42");
}

TEST_CASE("stringify escapes control characters as \\u00XX", "[json][stringify]") {
  std::string withControlChar = "a";
  withControlChar += '\x01';
  withControlChar += "b";
  REQUIRE(json::stringify(json::Value(withControlChar)) == "\"a\\u0001b\"");
}
