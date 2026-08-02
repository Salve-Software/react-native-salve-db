#pragma once

#include "../database/json_parser.hpp"
#include "../http/HttpTypes.hpp"
#include <string>

namespace margelo::nitro::salvedb {

struct SyncEndpoint {
  std::string basePath;
  std::string sinceParam;
  std::string limitParam;
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

  static SyncContract fromDefinition(const json::Value& definition);
};

// Single source of truth for the supported `sync.conflict.strategy` values —
// shared by SyncContract's own parsing and MigrationEngine::registerSchema's
// eager validation, so the two never drift apart.
bool isValidConflictStrategy(const std::string& strategy);

SyncConflict readConflictDefaults(const json::Value& syncDefinition);

} // namespace margelo::nitro::salvedb
