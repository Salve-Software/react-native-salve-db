#include "SyncContract.hpp"
#include <stdexcept>
#include <unordered_set>

namespace margelo::nitro::salvedb {

namespace {

std::string requireString(const json::Value& endpoint, const std::string& field) {
  std::string value = endpoint.getString(field);
  if (value.empty()) {
    throw std::runtime_error("SyncContract: sync.endpoint." + field + " is required");
  }
  return value;
}

HttpHeaders parseExtraHeaders(const json::Value& endpoint) {
  HttpHeaders headers;
  auto raw = endpoint.get("headers");
  if (raw && raw->get().isObject()) {
    for (auto& [name, value] : raw->get().asObject()) {
      if (value.isString()) headers.emplace_back(name, value.asString());
    }
  }
  return headers;
}

// Absent, or not an object (a pre-#103-style `conflict: "lastWriteWins"`
// string persisted by a version of the library predating this struct) —
// both fall back to the pre-existing hardcoded behavior instead of failing
// a cold-start reopen on stale persisted config.
SyncConflict parseConflict(const json::Value& definition) {
  SyncConflict conflict;
  auto raw = definition.get("conflict");
  if (!raw || !raw->get().isObject()) return conflict;

  conflict.strategy = raw->get().getString("strategy", "lastWriteWins");
  if (!isValidConflictStrategy(conflict.strategy)) {
    throw std::runtime_error("SyncContract: sync.conflict.strategy '" + conflict.strategy + "' is not supported");
  }
  conflict.field = raw->get().getString("field", "updatedAt");
  return conflict;
}

} // namespace

bool isValidConflictStrategy(const std::string& strategy) {
  static const std::unordered_set<std::string> kValidConflictStrategies = {
    "lastWriteWins", "serverWins", "clientWins"
  };
  return kValidConflictStrategies.count(strategy) > 0;
}

SyncContract SyncContract::fromDefinition(const json::Value& definition) {
  auto endpointVal = definition.get("endpoint");
  if (!endpointVal) {
    throw std::runtime_error("SyncContract: sync.endpoint is required");
  }
  const json::Value& endpoint = endpointVal->get();

  SyncContract contract;
  contract.endpoint.basePath = requireString(endpoint, "basePath");
  contract.endpoint.sinceParam = requireString(endpoint, "sinceParam");
  contract.endpoint.limitParam = requireString(endpoint, "limitParam");
  contract.endpoint.extraHeaders = parseExtraHeaders(endpoint);
  contract.endpoint.cursorField = endpoint.getString("cursorField", "updatedAt");
  contract.conflict = parseConflict(definition);

  auto pagination = definition.get("pagination");
  if (pagination) {
    if (pagination->get().has("pageSize")) {
      contract.pageSize = static_cast<int>(pagination->get().getNumber("pageSize", 20));
      if (contract.pageSize <= 0) {
        throw std::runtime_error("SyncContract: sync.pagination.pageSize must be a positive integer");
      }
    }
    if (pagination->get().has("maxPagesPerSession")) {
      contract.maxPagesPerSession = static_cast<int>(pagination->get().getNumber("maxPagesPerSession", 20));
      if (contract.maxPagesPerSession <= 0) {
        throw std::runtime_error("SyncContract: sync.pagination.maxPagesPerSession must be a positive integer");
      }
    }
  }

  return contract;
}

} // namespace margelo::nitro::salvedb
