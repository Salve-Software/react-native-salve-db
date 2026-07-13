#include "SyncOrchestrator.hpp"
#include "SyncApplyGuard.hpp"
#include "SyncCursorStore.hpp"
#include "SyncDefinitionStore.hpp"
#include "SyncOperationApplier.hpp"
#include "SyncQueueReader.hpp"
#include "../database/DatabaseManager.hpp"
#include "../expression/JsonPathExtractor.hpp"
#include "../expression/RequestExpressionEvaluator.hpp"
#include "../http/CredentialHttpCaller.hpp"
#include "../http/SyncHttpCaller.hpp"
#include <stdexcept>
#include <thread>
#include <variant>

namespace margelo::nitro::salvedb {

namespace {

constexpr int kMaxAttempts = 3;
std::chrono::milliseconds gRetryDelay{5000};

double nowMillis() {
  using namespace std::chrono;
  return static_cast<double>(duration_cast<milliseconds>(system_clock::now().time_since_epoch()).count());
}

json::Value buildRequestBody(
  const json::Value& requestDef,
  const std::optional<json::Value>& cursor,
  const json::Array& operations,
  double pageSize
) {
  auto bodyDef = requestDef.get("body");
  if (!bodyDef || !bodyDef->get().isObject()) {
    throw std::runtime_error("SyncOrchestrator: sync.request.body must be an object");
  }

  RequestExpressionEvaluator::VariableResolver resolver = [&](const std::string& refName) -> json::Value {
    if (refName == "cursor")     return cursor.value_or(json::Value(nullptr));
    if (refName == "operations") return json::Value(operations);
    if (refName == "pageSize")   return json::Value(pageSize);
    throw std::runtime_error("SyncOrchestrator: unsupported $ref \"" + refName + "\"");
  };

  json::Object body;
  for (auto& [key, exprNode] : bodyDef->get().asObject()) {
    body[key] = RequestExpressionEvaluator::evaluate(exprNode, resolver);
  }
  return json::Value(std::move(body));
}

// Retries network failures up to kMaxAttempts, and transparently refreshes
// the access token once on a 401 before reexecuting the same page.
SyncHttpResponse sendPageWithRetryAnd401(
  const json::Value& endpoint,
  const json::Value& body,
  CredentialProvider& credentials,
  const NetworkConfig& network
) {
  bool refreshed = false;
  int failedAttempts = 0; // counts only genuine network failures — a 401 refresh never touches this
  while (true) {
    auto authHeader = credentials.getAuthHeader();
    SyncHttpOutcome outcome = SyncHttpCaller::send(endpoint, body, authHeader, network);

    if (auto* error = std::get_if<HttpNetworkError>(&outcome)) {
      ++failedAttempts;
      if (failedAttempts < kMaxAttempts) {
        std::this_thread::sleep_for(gRetryDelay);
        continue;
      }
      throw std::runtime_error(
        "SyncOrchestrator: sync request failed after " + std::to_string(kMaxAttempts) +
        " attempts — " + error->message
      );
    }

    auto& response = std::get<SyncHttpResponse>(outcome);
    if (response.statusCode == 401 && !refreshed) {
      refreshed = true;
      credentials.refresh(CredentialHttpCaller::create(network));
      continue; // reexecute the same page — does not consume a retry attempt
    }
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw std::runtime_error(
        "SyncOrchestrator: sync request failed with status " + std::to_string(response.statusCode)
      );
    }
    return response;
  }
}

std::optional<std::string> extractPathString(const json::Value& responseDef, const std::string& field) {
  auto path = responseDef.get(field);
  if (!path || !path->get().isString()) return std::nullopt;
  return path->get().asString();
}

} // namespace

NativeSyncResult SyncOrchestrator::triggerSync(const std::string& schemaName) {
  auto conn = DatabaseManager::shared().connection();

  SyncDefinitionStore defStore(conn);
  auto definition = defStore.definitionFor(schemaName);
  if (!definition || !definition->getBool("enabled", false)) {
    throw std::runtime_error("SyncOrchestrator: schema '" + schemaName + "' has no sync.enabled contract registered");
  }
  const json::Value& def = *definition;

  auto& credentials   = DatabaseManager::shared().credentials();
  const auto& network = DatabaseManager::shared().network();

  SyncQueueReader reader(conn);
  SyncApplyGuard applyGuard(conn);
  SyncCursorStore cursorStore(conn);
  SyncOperationApplier applier(conn);

  double pageSize = 20;
  int maxPagesPerSession = 20;
  auto pagination = def.get("pagination");
  if (pagination && pagination->get().isObject()) {
    pageSize = pagination->get().getNumber("pageSize", 20);
    maxPagesPerSession = static_cast<int>(pagination->get().getNumber("maxPagesPerSession", 20));
  }

  auto requestDef  = def.get("request");
  auto responseDef = def.get("response");
  auto endpointDef = def.get("endpoint");
  if (!requestDef || !responseDef || !endpointDef) {
    throw std::runtime_error("SyncOrchestrator: schema '" + schemaName + "' sync.{endpoint,request,response} are required");
  }

  auto storedCursor = cursorStore.load(schemaName);
  std::optional<json::Value> cursor;
  if (storedCursor) cursor = json::parse(*storedCursor);

  double start = nowMillis();
  ApplyStats totalStats;
  bool hasMore = true;

  for (int page = 0; page < maxPagesPerSession && hasMore; ++page) {
    SyncQueuePage queuePage = reader.readPage(schemaName, static_cast<int>(pageSize));

    json::Value body = buildRequestBody(requestDef->get(), cursor, queuePage.operations, pageSize);
    SyncHttpResponse response = sendPageWithRetryAnd401(endpointDef->get(), body, credentials, network);

    json::Array appliedOps;
    if (auto opsPath = extractPathString(responseDef->get(), "operations")) {
      auto extracted = JsonPathExtractor::extract(response.body, *opsPath);
      if (extracted && extracted->isArray()) appliedOps = extracted->asArray();
    }

    std::optional<json::Value> newCursor;
    if (auto cursorPath = extractPathString(responseDef->get(), "cursor")) {
      newCursor = JsonPathExtractor::extract(response.body, *cursorPath);
    }

    hasMore = false;
    if (auto hasMorePath = extractPathString(responseDef->get(), "hasMore")) {
      auto extracted = JsonPathExtractor::extract(response.body, *hasMorePath);
      if (extracted && extracted->isBool()) hasMore = extracted->asBool();
    }

    applyGuard.applyWithBypass([&] {
      ApplyStats pageStats = applier.apply(schemaName, appliedOps);
      totalStats.inserted += pageStats.inserted;
      totalStats.updated  += pageStats.updated;
      totalStats.deleted  += pageStats.deleted;

      if (newCursor) {
        cursor = newCursor;
        cursorStore.save(schemaName, json::stringify(*newCursor));
      }
      if (queuePage.maxId) {
        conn->execute(
          "DELETE FROM sync_queue WHERE entity = ? AND id <= ?",
          { schemaName, static_cast<double>(*queuePage.maxId) }
        );
      }
    });
  }

  // Exposed as the plain string when the cursor is a JSON string (the common
  // case) rather than double-encoding it — json::stringify is only needed
  // for the round-trip through _salve_sync_cursors and the $ref resolver.
  std::optional<std::string> exposedCursor;
  if (cursor) exposedCursor = cursor->isString() ? cursor->asString() : json::stringify(*cursor);

  return NativeSyncResult(
    exposedCursor,
    static_cast<double>(totalStats.inserted + totalStats.updated + totalStats.deleted),
    static_cast<double>(totalStats.inserted),
    static_cast<double>(totalStats.updated),
    static_cast<double>(totalStats.deleted),
    nowMillis() - start
  );
}

namespace sync_test {
void setRetryDelay(std::chrono::milliseconds delay) { gRetryDelay = delay; }
} // namespace sync_test

} // namespace margelo::nitro::salvedb
