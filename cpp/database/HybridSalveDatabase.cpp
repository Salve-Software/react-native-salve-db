#include "HybridSalveDatabase.hpp"
#include "DatabaseManager.hpp"
#include "MigrationEngine.hpp"
#include "NativeConfigStore.hpp"
#include "../platform/platform.hpp"
#include <cmath>
#include <stdexcept>

namespace margelo::nitro::salvedb {

void HybridSalveDatabase::configure(const ConfigureParams& params) {
  if (params.name.empty())
    throw std::runtime_error("Database.configure: 'name' is required");
  if (params.baseUrl.has_value() != params.network.has_value())
    throw std::runtime_error("Database.configure: 'baseUrl' and 'network' must be provided together");
  if (params.background.has_value() &&
      (!std::isfinite(params.background->minimumInterval) || params.background->minimumInterval <= 0))
    throw std::runtime_error("Database.configure: 'background.minimumInterval' must be a finite number greater than 0");

  std::optional<BackgroundConfig> background;
  if (params.background.has_value()) {
    background = BackgroundConfig{
      params.background->minimumInterval,
      params.background->requiresNetwork.value_or(false),
      params.background->requiresCharging.value_or(false)
    };
  }

  {
    auto lock = DatabaseManager::shared().lockSync();

    DatabaseManager::shared().open(params.name, params.walMode.value_or(true));
    DatabaseManager::shared().configureSyncOnAppOpen(params.syncOnAppOpen.value_or(true));

    if (params.baseUrl.has_value())
      DatabaseManager::shared().configureNetwork(*params.baseUrl, params.network->timeout);

    if (params.credentials.has_value()) {
      const auto& creds = *params.credentials;
      std::optional<InitialCredentialTokens> initialTokens;
      if (creds.tokens.has_value()) {
        initialTokens = InitialCredentialTokens{creds.tokens->accessToken, creds.tokens->refreshToken};
      }
      DatabaseManager::shared().configureCredentials(
        creds.provider,
        creds.accessTokenHeaderName,
        creds.refresh.endpoint,
        creds.refresh.responseAccessTokenPath,
        creds.refresh.responseRefreshTokenPath,
        initialTokens
      );
    }

    DatabaseManager::shared().configureBackground(background);
  }

  PersistedConfig persisted;
  persisted.dbName = params.name;
  persisted.walMode = params.walMode.value_or(true);
  persisted.syncOnAppOpen = params.syncOnAppOpen.value_or(true);
  persisted.baseUrl = params.baseUrl;
  if (params.network.has_value()) persisted.networkTimeoutMs = params.network->timeout;
  if (params.credentials.has_value()) {
    const auto& creds = *params.credentials;
    persisted.credentials = PersistedCredentialConfig{
      creds.provider,
      creds.accessTokenHeaderName,
      creds.refresh.endpoint,
      creds.refresh.responseAccessTokenPath,
      creds.refresh.responseRefreshTokenPath
    };
  }
  persisted.background = background;

  NativeConfigStore::save(persisted);
  platform::scheduleBackgroundSync();
}

std::shared_ptr<Promise<void>> HybridSalveDatabase::registerSchema(const std::string& schemaJson) {
  return Promise<void>::async([schemaJson]() {
    auto& mgr = DatabaseManager::shared();
    if (!mgr.isOpen())
      throw std::runtime_error("Database.register: call Database.configure() before registering schemas");
    auto schema = MigrationEngine::parseSchemaJson(schemaJson);
    MigrationEngine engine(mgr.connection());
    engine.registerSchema(schema);
  });
}

QueryResult HybridSalveDatabase::execute(
  const std::string& sql,
  const std::vector<std::variant<nitro::NullType, bool, std::shared_ptr<ArrayBuffer>, std::string, double>>& params
) {
  return _queryExecutor.execute(sql, params);
}

void HybridSalveDatabase::beginTransaction() {
  _queryExecutor.beginTransaction();
}

void HybridSalveDatabase::commit() {
  _queryExecutor.commit();
}

void HybridSalveDatabase::rollback() {
  _queryExecutor.rollback();
}

std::shared_ptr<Promise<NativeSyncResult>> HybridSalveDatabase::triggerSync(const std::string& schemaName) {
  return Promise<NativeSyncResult>::async([this, schemaName]() {
    return _syncOrchestrator.triggerSync(schemaName);
  });
}

std::shared_ptr<Promise<std::vector<NativeSyncResult>>> HybridSalveDatabase::triggerSyncAll(bool discardIfBusy) {
  return Promise<std::vector<NativeSyncResult>>::async([this, discardIfBusy]() {
    return _syncOrchestrator.triggerSyncAll(discardIfBusy);
  });
}

double HybridSalveDatabase::subscribeToChanges(const std::function<void(const std::vector<std::string>&)>& callback) {
  int id = DatabaseManager::shared().connection()->subscribe(
    [callback](std::vector<std::string> tables) { callback(tables); }
  );
  return static_cast<double>(id);
}

void HybridSalveDatabase::unsubscribeFromChanges(double id) {
  DatabaseManager::shared().connection()->unsubscribe(static_cast<int>(id));
}

double HybridSalveDatabase::debugPreparedStatementCount() {
  return static_cast<double>(DatabaseManager::shared().connection()->prepareCount());
}

} // namespace margelo::nitro::salvedb
