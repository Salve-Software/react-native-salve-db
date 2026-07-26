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
};

// Typed, validated view of a schema's declarative `sync` block (REST contract, #84).
struct SyncContract {
  SyncEndpoint endpoint;
  int pageSize = 20;
  int maxPagesPerSession = 20;

  static SyncContract fromDefinition(const json::Value& definition);
};

} // namespace margelo::nitro::salvedb
