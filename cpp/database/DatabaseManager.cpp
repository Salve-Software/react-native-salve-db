#include "DatabaseManager.hpp"
#include "SchemaRegistry.hpp"
#include "../platform/platform.hpp"

namespace margelo::nitro::salvedb {

void DatabaseManager::open(const std::string& dbName, bool walMode) {
  std::string dir  = platform::getDocumentsDirectory();
  std::string path = dir + "/" + dbName + ".db";
  _db = std::make_shared<SQLiteConnection>(path, walMode);
  // Boolean-column registrations are keyed by table name, not by db file — a stale
  // entry from a previously-open database would otherwise silently leak into this one.
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

} // namespace margelo::nitro::salvedb
