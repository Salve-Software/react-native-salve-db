#include <catch2/catch_test_macros.hpp>
#include "../../database/NativeConfigStore.hpp"
#include "../../platform/platform.hpp"
#include <cstdio>
#include <fstream>

using namespace margelo::nitro::salvedb;

namespace {

std::string configFilePath() {
  return platform::getDocumentsDirectory() + "/_salve_config.json";
}

} // namespace

TEST_CASE("NativeConfigStore round-trips every field", "[database][NativeConfigStore]") {
  PersistedConfig config;
  config.dbName = "round_trip_db";
  config.walMode = false;
  config.syncOnAppOpen = false;
  config.baseUrl = "https://api.company.com";
  config.networkTimeoutMs = 9000.0;
  config.credentials = PersistedCredentialConfig{
    "oauth2", "Authorization", "https://api.company.com/refresh", "$.access_token", "$.refresh_token"
  };
  config.background = BackgroundConfig{900000.0, true, true};

  NativeConfigStore::save(config);
  auto loaded = NativeConfigStore::load();

  REQUIRE(loaded.has_value());
  REQUIRE(loaded->dbName == "round_trip_db");
  REQUIRE(loaded->walMode == false);
  REQUIRE(loaded->syncOnAppOpen == false);
  REQUIRE(loaded->baseUrl == "https://api.company.com");
  REQUIRE(loaded->networkTimeoutMs == 9000.0);
  REQUIRE(loaded->credentials.has_value());
  REQUIRE(loaded->credentials->provider == "oauth2");
  REQUIRE(loaded->credentials->accessTokenHeaderName == "Authorization");
  REQUIRE(loaded->credentials->refreshEndpoint == "https://api.company.com/refresh");
  REQUIRE(loaded->credentials->responseAccessTokenPath == "$.access_token");
  REQUIRE(loaded->credentials->responseRefreshTokenPath == "$.refresh_token");
  REQUIRE(loaded->background.has_value());
  REQUIRE(loaded->background->minimumIntervalMs == 900000.0);
  REQUIRE(loaded->background->requiresNetwork == true);
  REQUIRE(loaded->background->requiresCharging == true);
}

TEST_CASE("NativeConfigStore round-trips a config with no optional fields", "[database][NativeConfigStore]") {
  PersistedConfig config;
  config.dbName = "minimal_db";
  config.walMode = true;
  config.syncOnAppOpen = true;

  NativeConfigStore::save(config);
  auto loaded = NativeConfigStore::load();

  REQUIRE(loaded.has_value());
  REQUIRE(loaded->dbName == "minimal_db");
  REQUIRE_FALSE(loaded->baseUrl.has_value());
  REQUIRE_FALSE(loaded->networkTimeoutMs.has_value());
  REQUIRE_FALSE(loaded->credentials.has_value());
  REQUIRE_FALSE(loaded->background.has_value());
}

TEST_CASE("NativeConfigStore::load returns nullopt when no file exists", "[database][NativeConfigStore]") {
  std::remove(configFilePath().c_str());

  REQUIRE_FALSE(NativeConfigStore::load().has_value());
}

TEST_CASE("NativeConfigStore::load returns nullopt for corrupted content", "[database][NativeConfigStore]") {
  std::ofstream out(configFilePath(), std::ios::binary | std::ios::trunc);
  out << "{ not valid json";
  out.close();

  REQUIRE_FALSE(NativeConfigStore::load().has_value());
}
