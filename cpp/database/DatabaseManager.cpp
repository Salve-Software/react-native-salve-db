#include "DatabaseManager.hpp"
#include "SchemaRegistry.hpp"
#include "MigrationEngine.hpp"
#include "../platform/platform.hpp"

namespace margelo::nitro::salvedb {

void DatabaseManager::open(const std::string& dbName, bool walMode) {
  std::string dir  = platform::getDocumentsDirectory();
  std::string path = dir + "/" + dbName + ".db";
  _db = std::make_shared<SQLiteConnection>(path, walMode);
  // Keyed by schema name, not db file — avoid stale leaks across opens.
  SchemaRegistry::shared().clear();
  // So sync_queue reads (e.g. getSyncQueueStatus) work even before registerSchema() runs.
  MigrationEngine::ensureSyncInfra(*_db);
}

void DatabaseManager::configureCredentials(
  const std::string& provider,
  const std::string& accessTokenHeaderName,
  const std::string& refreshEndpoint,
  const std::string& responseAccessTokenPath,
  const std::string& responseRefreshTokenPath,
  const std::optional<InitialCredentialTokens>& initialTokens
) {
  _credentials = std::make_unique<CredentialProvider>(
    provider, accessTokenHeaderName, refreshEndpoint, responseAccessTokenPath, responseRefreshTokenPath
  );
  if (initialTokens.has_value()) {
    _credentials->seedInitialTokens(initialTokens->accessToken, initialTokens->refreshToken);
  }
}

void DatabaseManager::configureNetwork(const std::string& baseUrl, double timeoutMs) {
  _network = NetworkConfig{baseUrl, timeoutMs};
}

} // namespace margelo::nitro::salvedb
