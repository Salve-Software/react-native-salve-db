#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include "../../sync/SyncContract.hpp"

using Catch::Matchers::Equals;

using namespace margelo::nitro::salvedb;

TEST_CASE("fromDefinition parses basePath/listQueryTemplate, defaults itemPathTemplate, and pagination defaults", "[sync][SyncContract]") {
  auto contract = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}" }
  })"));

  REQUIRE(contract.endpoint.basePath == "/customers");
  REQUIRE(
    contract.endpoint.listQueryTemplate.render({{"since", "1700"}, {"limit", "50"}, {"cursorField", "updatedAt"}}) ==
    "updatedAfter=1700&limit=50"
  );
  // No itemPathTemplate declared — falls back to "{basePath}/{id}".
  REQUIRE(
    contract.endpoint.itemPathTemplate.render({{"basePath", "/customers"}, {"id", "1"}}) == "/customers/1"
  );
  REQUIRE(contract.endpoint.cursorField == "updatedAt");
  REQUIRE(contract.pageSize == 20);
  REQUIRE(contract.maxPagesPerSession == 20);
}

TEST_CASE("fromDefinition honors a custom endpoint.cursorField, independent of conflict strategy", "[sync][SyncContract]") {
  auto serverWins = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}", "cursorField": "modifiedAt" },
    "conflict": { "strategy": "serverWins" }
  })"));
  REQUIRE(serverWins.endpoint.cursorField == "modifiedAt");

  auto lastWriteWins = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}", "cursorField": "modifiedAt" }
  })"));
  REQUIRE(lastWriteWins.endpoint.cursorField == "modifiedAt");
}

TEST_CASE("fromDefinition rejects an explicitly empty endpoint.cursorField instead of failing later at pull time", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}", "cursorField": "" }
    })")),
    Equals("SyncContract: sync.endpoint.cursorField is required")
  );
}

TEST_CASE("fromDefinition parses a custom itemPathTemplate", "[sync][SyncContract]") {
  auto contract = SyncContract::fromDefinition(json::parse(R"JSON({
    "endpoint": {
      "basePath": "/Products",
      "itemPathTemplate": "{basePath}({id})",
      "listQueryTemplate": "$filter={cursorField} gt {since}&$top={limit}"
    }
  })JSON"));

  REQUIRE(
    contract.endpoint.itemPathTemplate.render({{"basePath", "/Products"}, {"id", "42"}}) == "/Products(42)"
  );
  REQUIRE(
    contract.endpoint.listQueryTemplate.render({{"since", "1700000000000"}, {"limit", "200"}, {"cursorField", "updatedAt"}}) ==
    "$filter=updatedAt%20gt%201700000000000&$top=200"
  );
}

TEST_CASE("fromDefinition honors explicit pagination values", "[sync][SyncContract]") {
  auto contract = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}" },
    "pagination": { "pageSize": 200, "maxPagesPerSession": 5 }
  })"));

  REQUIRE(contract.pageSize == 200);
  REQUIRE(contract.maxPagesPerSession == 5);
}

TEST_CASE("fromDefinition parses extra headers", "[sync][SyncContract]") {
  auto contract = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}", "headers": { "X-Tenant": "acme" } }
  })"));

  REQUIRE(contract.endpoint.extraHeaders.size() == 1);
  REQUIRE(contract.endpoint.extraHeaders[0].first == "X-Tenant");
  REQUIRE(contract.endpoint.extraHeaders[0].second == "acme");
}

TEST_CASE("fromDefinition throws naming the missing basePath field", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({"endpoint": { "listQueryTemplate": "updatedAfter={since}&limit={limit}" }})")),
    Equals("SyncContract: sync.endpoint.basePath is required")
  );
}

TEST_CASE("fromDefinition throws naming the missing listQueryTemplate field", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({"endpoint": { "basePath": "/customers" }})")),
    Equals("SyncContract: sync.endpoint.listQueryTemplate is required")
  );
}

TEST_CASE("fromDefinition throws when endpoint is missing entirely", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(SyncContract::fromDefinition(json::parse(R"({})")), Equals("SyncContract: sync.endpoint is required"));
}

TEST_CASE("fromDefinition rejects a listQueryTemplate token outside its closed vocabulary", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": { "basePath": "/customers", "listQueryTemplate": "id={id}" }
    })")),
    Equals(
      "UrlTemplate: sync.endpoint.listQueryTemplate references unknown token '{id}' (valid: since, limit, cursorField)"
    )
  );
}

TEST_CASE("fromDefinition rejects an itemPathTemplate token outside its closed vocabulary", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": {
        "basePath": "/customers",
        "itemPathTemplate": "{basePath}/{limit}",
        "listQueryTemplate": "updatedAfter={since}&limit={limit}"
      }
    })")),
    Equals("UrlTemplate: sync.endpoint.itemPathTemplate references unknown token '{limit}' (valid: basePath, id)")
  );
}

TEST_CASE("fromDefinition rejects a raw illegal character in a template's literal text", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": { "basePath": "/customers", "listQueryTemplate": "<updatedAfter>={since}&limit={limit}" }
    })")),
    Equals(
      "UrlTemplate: sync.endpoint.listQueryTemplate contains an illegal raw character '<' in its literal text — percent-encode it manually"
    )
  );
}

TEST_CASE("fromDefinition rejects a non-positive pageSize", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}" },
      "pagination": { "pageSize": 0 }
    })")),
    Equals("SyncContract: sync.pagination.pageSize must be a positive integer")
  );
}

TEST_CASE("fromDefinition rejects a negative maxPagesPerSession", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}" },
      "pagination": { "maxPagesPerSession": -1 }
    })")),
    Equals("SyncContract: sync.pagination.maxPagesPerSession must be a positive integer")
  );
}

TEST_CASE("an old-format schema (method/path) produces a clear error, not a silent default", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(SyncContract::fromDefinition(json::parse(R"({"endpoint": { "method": "POST", "path": "/sync/customers" }})")), Equals("SyncContract: sync.endpoint.basePath is required"));
}

TEST_CASE("fromDefinition defaults conflict to lastWriteWins/updatedAt when absent", "[sync][SyncContract]") {
  auto contract = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}" }
  })"));

  REQUIRE(contract.conflict.strategy == "lastWriteWins");
  REQUIRE(contract.conflict.field == "updatedAt");
}

TEST_CASE("fromDefinition honors an explicit conflict strategy and custom field", "[sync][SyncContract]") {
  auto contract = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}" },
    "conflict": { "strategy": "lastWriteWins", "field": "modifiedAt" }
  })"));

  REQUIRE(contract.conflict.strategy == "lastWriteWins");
  REQUIRE(contract.conflict.field == "modifiedAt");
}

TEST_CASE("fromDefinition honors serverWins/clientWins strategies", "[sync][SyncContract]") {
  auto server = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}" },
    "conflict": { "strategy": "serverWins" }
  })"));
  REQUIRE(server.conflict.strategy == "serverWins");

  auto client = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}" },
    "conflict": { "strategy": "clientWins" }
  })"));
  REQUIRE(client.conflict.strategy == "clientWins");
}

TEST_CASE("fromDefinition rejects an unsupported conflict strategy", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}" },
      "conflict": { "strategy": "yoloWins" }
    })")),
    Equals("SyncContract: sync.conflict.strategy 'yoloWins' is not supported")
  );
}

// A `_salve_sync_definitions` row persisted by a version of the library predating this struct
// stored `conflict` as a plain string (e.g. "lastWriteWins"), not an object — a cold-start reopen
// on stale persisted config must fall back to defaults instead of throwing.
TEST_CASE("fromDefinition falls back to defaults when conflict is a legacy plain string", "[sync][SyncContract]") {
  auto contract = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}&limit={limit}" },
    "conflict": "lastWriteWins"
  })"));

  REQUIRE(contract.conflict.strategy == "lastWriteWins");
  REQUIRE(contract.conflict.field == "updatedAt");
}

// The headless background-wake path (SyncNativeEntryPoint::wakeBackgroundSyncFromNative,
// via SyncOrchestrator::runSyncSession) reads `_salve_sync_definitions` before JS ever
// gets a chance to re-register a schema and rewrite a pre-#115 row — that path passes
// allowLegacyEndpointFallback=true, and must synthesize a template instead of throwing,
// same treatment as the legacy plain-string `conflict` case above.
TEST_CASE("fromDefinition(allowLegacyEndpointFallback=true) synthesizes listQueryTemplate from legacy sinceParam/limitParam", "[sync][SyncContract]") {
  auto contract = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "sinceParam": "updatedAfter", "limitParam": "limit" }
  })"), /*allowLegacyEndpointFallback*/ true);

  REQUIRE(
    contract.endpoint.listQueryTemplate.render({{"since", "1700"}, {"limit", "50"}, {"cursorField", "updatedAt"}}) ==
    "updatedAfter=1700&limit=50"
  );
}

// register() (MigrationEngine::parseSchemaJson) always calls fromDefinition with the
// strict default — #115 is a breaking change, a freshly authored schema still using
// sinceParam/limitParam must be rejected, not silently accepted.
TEST_CASE("fromDefinition (strict default) rejects legacy sinceParam/limitParam even when both are present", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": { "basePath": "/customers", "sinceParam": "updatedAfter", "limitParam": "limit" }
    })")),
    Equals("SyncContract: sync.endpoint.listQueryTemplate is required")
  );
}

TEST_CASE("fromDefinition(allowLegacyEndpointFallback=true) percent-encodes legacy param names", "[sync][SyncContract]") {
  auto contract = SyncContract::fromDefinition(json::parse(R"({
    "endpoint": { "basePath": "/customers", "sinceParam": "changed&tenant", "limitParam": "limit" }
  })"), /*allowLegacyEndpointFallback*/ true);

  REQUIRE(
    contract.endpoint.listQueryTemplate.render({{"since", "1700"}, {"limit", "50"}, {"cursorField", "updatedAt"}}) ==
    "changed%26tenant=1700&limit=50"
  );
}


TEST_CASE("fromDefinition throws when neither listQueryTemplate nor legacy sinceParam/limitParam are present", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({"endpoint": { "basePath": "/customers", "sinceParam": "updatedAfter" }})")),
    Equals("SyncContract: sync.endpoint.listQueryTemplate is required")
  );
}

TEST_CASE("fromDefinition rejects an explicit empty itemPathTemplate instead of rendering an empty path", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": { "basePath": "/customers", "itemPathTemplate": "", "listQueryTemplate": "updatedAfter={since}&limit={limit}" }
    })")),
    Equals("SyncContract: sync.endpoint.itemPathTemplate is required")
  );
}

TEST_CASE("fromDefinition rejects an itemPathTemplate that never references {id}", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": {
        "basePath": "/customers",
        "itemPathTemplate": "{basePath}/fixed",
        "listQueryTemplate": "updatedAfter={since}&limit={limit}"
      }
    })")),
    Equals("SyncContract: sync.endpoint.itemPathTemplate must reference {id} — PATCH/DELETE address a single row")
  );
}

TEST_CASE("fromDefinition rejects a listQueryTemplate missing {since}", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": { "basePath": "/customers", "listQueryTemplate": "limit={limit}" }
    })")),
    Equals("SyncContract: sync.endpoint.listQueryTemplate must reference both {since} and {limit}")
  );
}

TEST_CASE("fromDefinition rejects a listQueryTemplate missing {limit}", "[sync][SyncContract]") {
  REQUIRE_THROWS_WITH(
    SyncContract::fromDefinition(json::parse(R"({
      "endpoint": { "basePath": "/customers", "listQueryTemplate": "updatedAfter={since}" }
    })")),
    Equals("SyncContract: sync.endpoint.listQueryTemplate must reference both {since} and {limit}")
  );
}
