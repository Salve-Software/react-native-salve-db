#pragma once

#include "BackgroundConfig.hpp"
#include <optional>
#include <string>

namespace margelo::nitro::salvedb {

struct PersistedCredentialConfig {
  std::string provider;
  std::string accessTokenHeaderName;
  std::string refreshEndpoint;
  std::string responseAccessTokenPath;
  std::string responseRefreshTokenPath;
};

struct PersistedConfig {
  std::string dbName;
  bool walMode;
  bool syncOnAppOpen;
  std::optional<std::string> baseUrl;
  std::optional<double> networkTimeoutMs;
  std::optional<PersistedCredentialConfig> credentials;
  std::optional<BackgroundConfig> background;
};

// Durable, JS-independent mirror of the config passed to Database.configure(),
// so a process woken purely by the native background scheduler can reopen the
// database and know the sync endpoint without JS ever running.
class NativeConfigStore {
public:
  static void save(const PersistedConfig& config);
  static std::optional<PersistedConfig> load();
};

} // namespace margelo::nitro::salvedb
