#include <catch2/catch_test_macros.hpp>
#include "../../expression/JsonPathExtractor.hpp"

using namespace margelo::nitro::salvedb;

TEST_CASE("extracts a top-level field", "[expression][JsonPathExtractor]") {
  auto response = json::parse(R"({"cursor": "abc123", "hasMore": true})");

  auto cursor = JsonPathExtractor::extract(response, "$.cursor");
  REQUIRE(cursor.has_value());
  REQUIRE(cursor->asString() == "abc123");

  auto hasMore = JsonPathExtractor::extract(response, "$.hasMore");
  REQUIRE(hasMore.has_value());
  REQUIRE(hasMore->asBool() == true);
}

TEST_CASE("extracts a nested field", "[expression][JsonPathExtractor]") {
  auto response = json::parse(R"({"data": {"items": [1, 2, 3]}})");

  auto items = JsonPathExtractor::extract(response, "$.data.items");
  REQUIRE(items.has_value());
  REQUIRE(items->asArray().size() == 3);
}

TEST_CASE("returns nullopt for an absent path", "[expression][JsonPathExtractor]") {
  auto response = json::parse(R"({"cursor": "abc123"})");

  auto missing = JsonPathExtractor::extract(response, "$.missing");
  REQUIRE_FALSE(missing.has_value());

  auto missingNested = JsonPathExtractor::extract(response, "$.data.items");
  REQUIRE_FALSE(missingNested.has_value());
}

TEST_CASE("distinguishes an absent path from a path resolving to null", "[expression][JsonPathExtractor]") {
  auto response = json::parse(R"({"a": null})");

  auto present = JsonPathExtractor::extract(response, "$.a");
  REQUIRE(present.has_value());
  REQUIRE(present->isNull());

  auto absent = JsonPathExtractor::extract(response, "$.b");
  REQUIRE_FALSE(absent.has_value());
}

TEST_CASE("$ alone returns the root value", "[expression][JsonPathExtractor]") {
  auto response = json::parse(R"({"cursor": "abc123"})");

  auto root = JsonPathExtractor::extract(response, "$");
  REQUIRE(root.has_value());
  REQUIRE(root->asObject().at("cursor").asString() == "abc123");
}

TEST_CASE("malformed paths throw instead of returning nullopt", "[expression][JsonPathExtractor]") {
  auto response = json::parse(R"({"cursor": "abc123"})");

  REQUIRE_THROWS_AS(JsonPathExtractor::extract(response, "cursor"), std::runtime_error);
  REQUIRE_THROWS_AS(JsonPathExtractor::extract(response, ""), std::runtime_error);
  REQUIRE_THROWS_AS(JsonPathExtractor::extract(response, "$cursor"), std::runtime_error);
  REQUIRE_THROWS_AS(JsonPathExtractor::extract(response, "$.data."), std::runtime_error);
  REQUIRE_THROWS_AS(JsonPathExtractor::extract(response, "$..data"), std::runtime_error);
}
