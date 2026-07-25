#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include "../../sync/SyncContract.hpp"

using Catch::Matchers::Equals;

using namespace margelo::nitro::salvedb;

TEST_CASE("fromDefinition parses basePath/sinceParam/limitParam and pagination defaults", "[sync][SyncContract]") {
  auto contract = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "sinceParam": "updatedAfter", "limitParam": "limit" }
  })"));

  REQUIRE(contract.endpoint.basePath == "/customers");
  REQUIRE(contract.endpoint.sinceParam == "updatedAfter");
  REQUIRE(contract.endpoint.limitParam == "limit");
  REQUIRE(contract.pageSize == 20);
  REQUIRE(contract.maxPagesPerSession == 20);
}

TEST_CASE("fromDefinition honors explicit pagination values", "[sync][SyncContract]") {
  auto contract = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "sinceParam": "updatedAfter", "limitParam": "limit" },
    "pagination": { "pageSize": 200, "maxPagesPerSession": 5 }
  })"));

  REQUIRE(contract.pageSize == 200);
  REQUIRE(contract.maxPagesPerSession == 5);
}

TEST_CASE("fromDefinition parses extra headers", "[sync][SyncContract]") {
  auto contract = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "sinceParam": "updatedAfter", "limitParam": "limit", "headers": { "X-Tenant": "acme" } }
  })"));

  REQUIRE(contract.endpoint.extraHeaders.size() == 1);
  REQUIRE(contract.endpoint.extraHeaders[0].first == "X-Tenant");
  REQUIRE(contract.endpoint.extraHeaders[0].second == "acme");
}

TEST_CASE("fromDefinition throws naming the missing field", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(SyncContract::fromDefinition(json::parse(R"({"endpoint": { "sinceParam": "updatedAfter", "limitParam": "limit" }})")), Equals("SyncContract: sync.endpoint.basePath is required"));
}

TEST_CASE("fromDefinition throws when endpoint is missing entirely", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(SyncContract::fromDefinition(json::parse(R"({})")), Equals("SyncContract: sync.endpoint is required"));
}

TEST_CASE("fromDefinition rejects a non-positive pageSize", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": { "basePath": "/customers", "sinceParam": "updatedAfter", "limitParam": "limit" },
      "pagination": { "pageSize": 0 }
    })")),
    Equals("SyncContract: sync.pagination.pageSize must be a positive integer")
  );
}

TEST_CASE("fromDefinition rejects a negative maxPagesPerSession", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": { "basePath": "/customers", "sinceParam": "updatedAfter", "limitParam": "limit" },
      "pagination": { "maxPagesPerSession": -1 }
    })")),
    Equals("SyncContract: sync.pagination.maxPagesPerSession must be a positive integer")
  );
}

TEST_CASE("an old-format schema (method/path) produces a clear error, not a silent default", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(SyncContract::fromDefinition(json::parse(R"({"endpoint": { "method": "POST", "path": "/sync/customers" }})")), Equals("SyncContract: sync.endpoint.basePath is required"));
}
