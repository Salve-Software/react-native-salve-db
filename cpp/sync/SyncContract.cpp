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

// Only ever reached via the legacy fallback below — no other caller needs
// two loose query-param names anymore (#115 replaced them with
// listQueryTemplate). Kept as a tiny helper purely to name the intent.
std::string legacyListQueryTemplate(const json::Value& endpoint) {
  std::string legacySince = endpoint.getString("sinceParam");
  std::string legacyLimit = endpoint.getString("limitParam");
  if (legacySince.empty() || legacyLimit.empty()) {
    throw std::runtime_error("SyncContract: sync.endpoint.listQueryTemplate is required");
  }
  return legacySince + "={since}&" + legacyLimit + "={limit}";
}

bool isValidConflictStrategy(const std::string& strategy) {
  static const std::unordered_set<std::string> kValidConflictStrategies = {
    "lastWriteWins", "serverWins", "clientWins"
  };
  return kValidConflictStrategies.count(strategy) > 0;
}

SyncConflict readConflictDefaults(const json::Value& definition) {
  SyncConflict conflict;
  auto raw = definition.get("conflict");
  if (!raw || !raw->get().isObject()) return conflict;

  conflict.strategy = raw->get().getString("strategy", "lastWriteWins");
  conflict.fieldExplicit = raw->get().has("field");
  conflict.field = raw->get().getString("field", "updatedAt");
  return conflict;
}

SyncConflict parseConflict(const json::Value& definition) {
  SyncConflict conflict = readConflictDefaults(definition);
  if (!isValidConflictStrategy(conflict.strategy)) {
    throw std::runtime_error("SyncContract: sync.conflict.strategy '" + conflict.strategy + "' is not supported");
  }
  return conflict;
}

} // namespace

SyncContract SyncContract::fromDefinition(const json::Value& definition) {
  auto endpointVal = definition.get("endpoint");
  if (!endpointVal) {
    throw std::runtime_error("SyncContract: sync.endpoint is required");
  }
  const json::Value& endpoint = endpointVal->get();

  SyncContract contract;
  contract.endpoint.basePath = requireString(endpoint, "basePath");

  std::string itemPathRaw = endpoint.has("itemPathTemplate")
    ? requireString(endpoint, "itemPathTemplate")
    : "{basePath}/{id}";
  contract.endpoint.itemPathTemplate =
    UrlTemplate::parse(itemPathRaw, UrlTemplateContext::Item, "sync.endpoint.itemPathTemplate");
  if (!contract.endpoint.itemPathTemplate.references("id")) {
    throw std::runtime_error(
      "SyncContract: sync.endpoint.itemPathTemplate must reference {id} — PATCH/DELETE address a single row"
    );
  }

  // A pre-#115 `_salve_sync_definitions` row (sinceParam/limitParam, no
  // listQueryTemplate) reaches here from the headless background-wake path
  // (SyncNativeEntryPoint::wakeBackgroundSyncFromNative), which runs before
  // JS ever gets a chance to re-register the schema and rewrite the row in
  // the new format. Falling back instead of throwing keeps background sync
  // alive across the upgrade — same treatment #84 gave a legacy plain-string
  // `conflict`.
  std::string listQueryRaw = endpoint.getString("listQueryTemplate");
  if (listQueryRaw.empty()) {
    listQueryRaw = legacyListQueryTemplate(endpoint);
  }
  contract.endpoint.listQueryTemplate =
    UrlTemplate::parse(listQueryRaw, UrlTemplateContext::ListQuery, "sync.endpoint.listQueryTemplate");
  if (!contract.endpoint.listQueryTemplate.references("since") ||
      !contract.endpoint.listQueryTemplate.references("limit")) {
    throw std::runtime_error(
      "SyncContract: sync.endpoint.listQueryTemplate must reference both {since} and {limit}"
    );
  }
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
