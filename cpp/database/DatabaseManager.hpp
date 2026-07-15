#pragma once

#include "../credentials/CredentialProvider.hpp"
#include "../http/NetworkConfig.hpp"
#include "BackgroundConfig.hpp"
#include "SQLiteConnection.hpp"
#include <memory>
#include <mutex>
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

  void open(const std::string& dbName, bool walMode = true);

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

  void configureNetwork(const std::string& baseUrl, double timeoutMs);

  const NetworkConfig& network() const {
    if (!_network)
      throw std::runtime_error("Database.configure() was not called with 'baseUrl'/'network' — sync is unavailable.");
    return *_network;
  }

  void configureSyncOnAppOpen(bool enabled) { _syncOnAppOpen = enabled; }
  bool syncOnAppOpen() const { return _syncOnAppOpen; }

  void configureBackground(const std::optional<BackgroundConfig>& background) { _background = background; }
  std::optional<BackgroundConfig> background() const { return _background; }

  bool reopenFromPersistedConfigIfNeeded();

  std::unique_lock<std::mutex> lockSync() {
    return std::unique_lock<std::mutex>(_syncMutex);
  }

  std::unique_lock<std::mutex> tryLockSync() {
    return std::unique_lock<std::mutex>(_syncMutex, std::try_to_lock);
  }

private:
  DatabaseManager() = default;
  std::shared_ptr<SQLiteConnection> _db;
  std::unique_ptr<CredentialProvider> _credentials;
  std::optional<NetworkConfig> _network;
  std::optional<BackgroundConfig> _background;
  std::mutex _syncMutex;
  bool _syncOnAppOpen = true;
};

} // namespace margelo::nitro::salvedb
