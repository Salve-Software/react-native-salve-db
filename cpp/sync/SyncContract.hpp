#pragma once

#include "../database/json_parser.hpp"
#include "../http/HttpTypes.hpp"
#include "../http/UrlTemplate.hpp"
#include <string>

namespace margelo::nitro::salvedb {

struct SyncEndpoint {
  std::string basePath;
  // Fallback when the schema omits `itemPathTemplate`: `{basePath}/{id}`,
  // matching the pre-#115 hardcoded behavior exactly.
  UrlTemplate itemPathTemplate;
  UrlTemplate listQueryTemplate;
  HttpHeaders extraHeaders;
  // Per-row JSON field carrying that row's timestamp, read from the last row
  // of a pulled page to advance the incremental-pull cursor. Required
  // regardless of conflict strategy — pagination, not conflict resolution.
  std::string cursorField = "updatedAt";
};

// `field` only applies to `lastWriteWins` — the NOT NULL datetime column
// (local schema and API payload alike) compared to resolve pull conflicts.
// Configurable so an API's own timestamp field name can be used instead of
// forcing `updatedAt`.
struct SyncConflict {
  std::string strategy = "lastWriteWins";
  std::string field = "updatedAt";
  bool fieldExplicit = false;
};

// Typed, validated view of a schema's declarative `sync` block (REST contract, #84).
struct SyncContract {
  SyncEndpoint endpoint;
  SyncConflict conflict;
  int pageSize = 20;
  int maxPagesPerSession = 20;

  // `allowLegacyEndpointFallback`: when true, a missing `listQueryTemplate`
  // is synthesized from legacy `sinceParam`/`limitParam` instead of throwing.
  // Only `SyncOrchestrator` (reading a possibly pre-#115 persisted
  // `_salve_sync_definitions` row from the headless background-wake path)
  // passes true. `MigrationEngine::parseSchemaJson` (register(), always
  // fresh JS-authored schema JSON) uses the strict default — the #115
  // breaking change requires listQueryTemplate explicitly there, no
  // silent legacy acceptance.
  static SyncContract fromDefinition(const json::Value& definition, bool allowLegacyEndpointFallback = false);
};

} // namespace margelo::nitro::salvedb
