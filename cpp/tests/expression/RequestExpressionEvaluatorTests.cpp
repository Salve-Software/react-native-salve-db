#include <catch2/catch_test_macros.hpp>
#include "../../database/MigrationEngine.hpp"
#include "../../database/SQLiteConnection.hpp"
#include "../../expression/RequestExpressionEvaluator.hpp"
#include "../../platform/platform.hpp"
#include "../../sync/SyncQueueReader.hpp"
#include <memory>

using namespace margelo::nitro::salvedb;

TEST_CASE("evaluates ConstantExpression", "[expression][RequestExpressionEvaluator]") {
  auto noopResolver = [](const std::string&) -> json::Value { return json::Value(nullptr); };

  REQUIRE(RequestExpressionEvaluator::evaluate(json::parse(R"({"value": 42})"), noopResolver).asNumber() == 42);
  REQUIRE(RequestExpressionEvaluator::evaluate(json::parse(R"({"value": "abc"})"), noopResolver).asString() == "abc");
  REQUIRE(RequestExpressionEvaluator::evaluate(json::parse(R"({"value": true})"), noopResolver).asBool() == true);
  REQUIRE(RequestExpressionEvaluator::evaluate(json::parse(R"({"value": null})"), noopResolver).isNull());
}

TEST_CASE("evaluates nested multi-level ObjectExpression", "[expression][RequestExpressionEvaluator]") {
  auto noopResolver = [](const std::string&) -> json::Value { return json::Value(nullptr); };

  auto result = RequestExpressionEvaluator::evaluate(json::parse(R"({
    "object": {
      "a": { "value": 1 },
      "b": { "object": { "c": { "value": 2 } } }
    }
  })"), noopResolver);

  REQUIRE(result.asObject().at("a").asNumber() == 1);
  REQUIRE(result.asObject().at("b").asObject().at("c").asNumber() == 2);
}

TEST_CASE("evaluates ArrayExpression with mixed nested items", "[expression][RequestExpressionEvaluator]") {
  auto noopResolver = [](const std::string&) -> json::Value { return json::Value(nullptr); };

  auto result = RequestExpressionEvaluator::evaluate(json::parse(R"({
    "items": [
      { "value": 1 },
      { "object": { "x": { "value": 2 } } }
    ]
  })"), noopResolver);

  REQUIRE(result.asArray().size() == 2);
  REQUIRE(result.asArray()[0].asNumber() == 1);
  REQUIRE(result.asArray()[1].asObject().at("x").asNumber() == 2);
}

TEST_CASE("resolves $ref: cursor and pageSize via the injected resolver", "[expression][RequestExpressionEvaluator]") {
  auto resolver = [](const std::string& refName) -> json::Value {
    if (refName == "cursor") return json::Value(std::string("abc123"));
    if (refName == "pageSize") return json::Value(50.0);
    FAIL("unexpected ref: " + refName);
    return json::Value(nullptr);
  };

  REQUIRE(RequestExpressionEvaluator::evaluate(json::parse(R"({"$ref": "cursor"})"), resolver).asString() == "abc123");
  REQUIRE(RequestExpressionEvaluator::evaluate(json::parse(R"({"$ref": "pageSize"})"), resolver).asNumber() == 50);
}

TEST_CASE("unimplemented MVP $refs throw without calling the resolver", "[expression][RequestExpressionEvaluator]") {
  for (const std::string& ref : {"deviceId", "platform", "timestamp", "userId", "changes"}) {
    auto expr = json::parse(R"({"$ref": ")" + ref + "\"}");
    REQUIRE_THROWS_AS(
      RequestExpressionEvaluator::evaluate(expr, [](const std::string&) -> json::Value {
        FAIL("resolver should not be called for an unimplemented ref");
        return json::Value(nullptr);
      }),
      std::runtime_error
    );
  }
}

TEST_CASE("unknown $ref outside the documented union throws", "[expression][RequestExpressionEvaluator]") {
  REQUIRE_THROWS_AS(
    RequestExpressionEvaluator::evaluate(json::parse(R"({"$ref": "somethingElse"})"), [](const std::string&) -> json::Value {
      FAIL("resolver should not be called for an unknown ref");
      return json::Value(nullptr);
    }),
    std::runtime_error
  );
}

TEST_CASE("malformed or ambiguous expression nodes throw", "[expression][RequestExpressionEvaluator]") {
  auto noopResolver = [](const std::string&) -> json::Value { return json::Value(nullptr); };

  REQUIRE_THROWS_AS(RequestExpressionEvaluator::evaluate(json::parse(R"({"foo": "bar"})"), noopResolver), std::runtime_error);
  REQUIRE_THROWS_AS(RequestExpressionEvaluator::evaluate(json::parse(R"({"$ref": "cursor", "value": 1})"), noopResolver), std::runtime_error);
  REQUIRE_THROWS_AS(RequestExpressionEvaluator::evaluate(json::parse("42"), noopResolver), std::runtime_error);
}

TEST_CASE("composes a full request body with cursor/operations/pageSize wired to a real sync_queue", "[expression][RequestExpressionEvaluator][integration]") {
  auto conn = std::make_shared<SQLiteConnection>(platform::getDocumentsDirectory() + "/evaluator_composition.db");
  MigrationEngine engine(conn);
  engine.registerSchema(MigrationEngine::parseSchemaJson(R"({
    "name": "customers", "version": 1, "primaryKey": "id",
    "columns": { "id": { "type": "integer" }, "name": { "type": "text" } },
    "sync": { "enabled": true }
  })"));
  conn->execute("INSERT INTO customers (id, name) VALUES (1, 'a')", {});

  SyncQueueReader reader(conn);
  auto resolver = [&](const std::string& refName) -> json::Value {
    if (refName == "cursor") return json::Value(std::string("abc123"));
    if (refName == "pageSize") return json::Value(20.0);
    if (refName == "operations") return json::Value(reader.readOperations(20));
    FAIL("unexpected ref: " + refName);
    return json::Value(nullptr);
  };

  auto body = RequestExpressionEvaluator::evaluate(json::parse(R"({
    "object": {
      "cursor": { "$ref": "cursor" },
      "operations": { "$ref": "operations" },
      "pageSize": { "$ref": "pageSize" }
    }
  })"), resolver);

  const auto& obj = body.asObject();
  REQUIRE(obj.at("cursor").asString() == "abc123");
  REQUIRE(obj.at("pageSize").asNumber() == 20);
  REQUIRE(obj.at("operations").asArray().size() == 1);
  REQUIRE(obj.at("operations").asArray()[0].asObject().at("entity").asString() == "customers");
}
