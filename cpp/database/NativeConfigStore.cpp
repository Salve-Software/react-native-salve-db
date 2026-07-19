#include "NativeConfigStore.hpp"
#include "json_parser.hpp"
#include "../platform/platform.hpp"
#include <cstdio>
#include <fstream>
#include <sstream>
#include <stdexcept>

namespace margelo::nitro::salvedb {

namespace {

std::string configFilePath() {
  return platform::getDocumentsDirectory() + "/_salve_config.json";
}

json::Object serializeCredentials(const PersistedCredentialConfig& creds) {
  json::Object obj;
  obj["provider"] = json::Value(creds.provider);
  obj["accessTokenHeaderName"] = json::Value(creds.accessTokenHeaderName);
  obj["refreshEndpoint"] = json::Value(creds.refreshEndpoint);
  obj["responseAccessTokenPath"] = json::Value(creds.responseAccessTokenPath);
  obj["responseRefreshTokenPath"] = json::Value(creds.responseRefreshTokenPath);
  return obj;
}

json::Object serializeBackground(const BackgroundConfig& bg) {
  json::Object obj;
  obj["minimumIntervalMs"] = json::Value(bg.minimumIntervalMs);
  obj["requiresNetwork"] = json::Value(bg.requiresNetwork);
  obj["requiresCharging"] = json::Value(bg.requiresCharging);
  return obj;
}

std::optional<PersistedCredentialConfig> parseCredentials(const json::Value& root) {
  auto v = root.get("credentials");
  if (!v || !v->get().isObject()) return std::nullopt;
  const json::Value& obj = v->get();
  return PersistedCredentialConfig{
    obj.getString("provider"),
    obj.getString("accessTokenHeaderName"),
    obj.getString("refreshEndpoint"),
    obj.getString("responseAccessTokenPath"),
    obj.getString("responseRefreshTokenPath"),
  };
}

std::optional<BackgroundConfig> parseBackground(const json::Value& root) {
  auto v = root.get("background");
  if (!v || !v->get().isObject()) return std::nullopt;
  const json::Value& obj = v->get();
  return BackgroundConfig{
    obj.getNumber("minimumIntervalMs"),
    obj.getBool("requiresNetwork", false),
    obj.getBool("requiresCharging", false),
  };
}

} // namespace

void NativeConfigStore::save(const PersistedConfig& config) {
  json::Object obj;
  obj["dbName"] = json::Value(config.dbName);
  obj["walMode"] = json::Value(config.walMode);
  obj["syncOnAppOpen"] = json::Value(config.syncOnAppOpen);
  if (config.baseUrl.has_value()) obj["baseUrl"] = json::Value(*config.baseUrl);
  if (config.networkTimeoutMs.has_value()) obj["networkTimeoutMs"] = json::Value(*config.networkTimeoutMs);
  if (config.credentials.has_value()) obj["credentials"] = json::Value(serializeCredentials(*config.credentials));
  if (config.background.has_value()) obj["background"] = json::Value(serializeBackground(*config.background));

  std::string serialized = json::stringify(json::Value(std::move(obj)));

  std::string path = configFilePath();
  std::string tmpPath = path + ".tmp";
  {
    std::ofstream out(tmpPath, std::ios::binary | std::ios::trunc);
    if (!out) {
      throw std::runtime_error("NativeConfigStore: failed to open " + tmpPath + " for writing");
    }
    out << serialized;
    out.flush();
    if (!out) {
      out.close();
      std::remove(tmpPath.c_str());
      throw std::runtime_error("NativeConfigStore: failed to write " + tmpPath);
    }
    out.close();
    if (out.fail()) {
      std::remove(tmpPath.c_str());
      throw std::runtime_error("NativeConfigStore: failed to close " + tmpPath);
    }
  }
  if (std::rename(tmpPath.c_str(), path.c_str()) != 0) {
    throw std::runtime_error("NativeConfigStore: failed to replace " + path);
  }
}

std::optional<PersistedConfig> NativeConfigStore::load() {
  std::ifstream in(configFilePath(), std::ios::binary);
  if (!in) return std::nullopt;

  std::ostringstream buffer;
  buffer << in.rdbuf();
  std::string raw = buffer.str();
  if (raw.empty()) return std::nullopt;

  json::Value root;
  try {
    root = json::parse(raw);
  } catch (...) {
    return std::nullopt;
  }
  if (!root.isObject()) return std::nullopt;

  std::string dbName = root.getString("dbName");
  if (dbName.empty()) return std::nullopt;

  PersistedConfig config;
  config.dbName = dbName;
  config.walMode = root.getBool("walMode", true);
  config.syncOnAppOpen = root.getBool("syncOnAppOpen", true);

  if (auto v = root.get("baseUrl"); v && v->get().isString()) {
    config.baseUrl = v->get().asString();
  }
  if (auto v = root.get("networkTimeoutMs"); v && v->get().isNumber()) {
    config.networkTimeoutMs = v->get().asNumber();
  }
  config.credentials = parseCredentials(root);
  config.background = parseBackground(root);

  return config;
}

} // namespace margelo::nitro::salvedb
