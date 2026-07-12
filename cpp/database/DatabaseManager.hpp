#pragma once

#include "../credentials/CredentialProvider.hpp"
#include "SQLiteConnection.hpp"
#include <memory>
#include <optional>
#include <stdexcept>
#include <string>

namespace margelo::nitro::salvedb {

// Optional initial token pair, decoupled from the Nitro-generated
// InitialTokensParams so this header has no JSI dependency.
struct InitialCredentialTokens {
  std::string accessToken;
  std::string refreshToken;
};

class DatabaseManager {
public:
  static DatabaseManager& shared() {
    static DatabaseManager instance;
    return instance;
  }

  void open(const std::string& dbName);

  std::shared_ptr<SQLiteConnection> connection() const {
    if (!_db)
      throw std::runtime_error("Database not configured — call Database.configure() before any other operation.");
    return _db;
  }

  bool isOpen() const { return _db != nullptr; }

  // Builds (or replaces) the single global CredentialProvider. Seeds the
  // initial token pair, if provided, into secure storage.
  void configureCredentials(
    const std::string& provider,
    const std::string& accessTokenHeaderName,
    const std::string& refreshEndpoint,
    const std::string& responseAccessTokenPath,
    const std::string& responseRefreshTokenPath,
    const std::optional<InitialCredentialTokens>& initialTokens
  );

  CredentialProvider& credentials() const {
    if (!_credentials)
      throw std::runtime_error("Database.configure() was not called with 'credentials' — sync/auth is unavailable.");
    return *_credentials;
  }

private:
  DatabaseManager() = default;
  std::shared_ptr<SQLiteConnection> _db;
  std::unique_ptr<CredentialProvider> _credentials;
};

} // namespace margelo::nitro::salvedb
