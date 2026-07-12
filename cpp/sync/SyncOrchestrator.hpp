#pragma once

#include "../http/IHttpClient.hpp"
#include "NativeSyncResult.hpp"
#include <memory>
#include <string>

namespace margelo::nitro::salvedb {

// Plain C++ collaborator (not a HybridObject) — owned and forwarded to by
// HybridSalveDatabase, which is the single Nitro-facing orchestrator.
class SyncOrchestrator {
public:
  SyncOrchestrator() = default;
  explicit SyncOrchestrator(std::shared_ptr<IHttpClient> httpClient): _httpClient(std::move(httpClient)) {}

  void setHttpClient(std::shared_ptr<IHttpClient> httpClient) { _httpClient = std::move(httpClient); }
  const std::shared_ptr<IHttpClient>& httpClient() const { return _httpClient; }

  NativeSyncResult triggerSync(const std::string& schemaName);

private:
  std::shared_ptr<IHttpClient> _httpClient;
};

} // namespace margelo::nitro::salvedb
