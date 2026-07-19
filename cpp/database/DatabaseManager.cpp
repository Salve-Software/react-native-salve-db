#include "DatabaseManager.hpp"
#include "NativeConfigStore.hpp"
#include "SchemaRegistry.hpp"
#include "../platform/platform.hpp"

namespace margelo::nitro::salvedb {

void DatabaseManager::open(const std::string& dbName, bool walMode) {
  std::string dir  = platform::getDocumentsDirectory();
  std::string path = dir + "/" + dbName + ".db";
  _db = std::make_shared<SQLiteConnection>(path, walMode);
  // Keyed by schema name, not db file — avoid stale leaks across opens.
  SchemaRegistry::shared().clear();
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

bool DatabaseManager::reopenFromPersistedConfigIfNeeded() {
  if (isOpen()) return true;

  auto lock = lockSync();
  if (isOpen()) return true;

  auto persisted = NativeConfigStore::load();
  if (!persisted.has_value()) return false;

  open(persisted->dbName, persisted->walMode);
  configureSyncOnAppOpen(persisted->syncOnAppOpen);

  if (persisted->baseUrl.has_value() && persisted->networkTimeoutMs.has_value()) {
    configureNetwork(*persisted->baseUrl, *persisted->networkTimeoutMs);
  }

  if (persisted->credentials.has_value()) {
    const auto& creds = *persisted->credentials;
    configureCredentials(
      creds.provider,
      creds.accessTokenHeaderName,
      creds.refreshEndpoint,
      creds.responseAccessTokenPath,
      creds.responseRefreshTokenPath,
      std::nullopt
    );
  }

  configureBackground(persisted->background);

  return true;
}

} // namespace margelo::nitro::salvedb
