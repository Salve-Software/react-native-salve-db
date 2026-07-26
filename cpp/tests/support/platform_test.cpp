#include "../../platform/platform.hpp"
#include "platform_test.hpp"
#include <cstdlib>
#include <iostream>
#include <stdexcept>
#include <unistd.h>
#include <unordered_map>

namespace margelo::nitro::salvedb::platform {

// Host test double for cpp/platform/platform.hpp: returns a fresh temp
// directory per process instead of the real iOS/Android documents dir.
void setDocumentsDirectory(const std::string&) {}

std::string getDocumentsDirectory() {
  static std::string dir = []() {
    std::string tmpl = "/tmp/salvedb_tests.XXXXXX";
    char* result = mkdtemp(tmpl.data());
    if (!result) throw std::runtime_error("mkdtemp failed for test documents directory");
    return std::string(result);
  }();
  return dir;
}

// Host test double for the secure store: plain in-memory map. Real
// Keychain/Keystore encryption is exercised only on-device (out of reach
// of this host-run Catch2 suite), not here.
namespace {
std::unordered_map<std::string, std::string>& secureStore() {
  static std::unordered_map<std::string, std::string> store;
  return store;
}
} // namespace

void setSecureValue(const std::string& key, const std::string& value) {
  secureStore()[key] = value;
}

std::optional<std::string> getSecureValue(const std::string& key) {
  auto& store = secureStore();
  auto it = store.find(key);
  if (it == store.end()) return std::nullopt;
  return it->second;
}

void deleteSecureValue(const std::string& key) {
  secureStore().erase(key);
}

void scheduleBackgroundSync() noexcept {
  test::scheduleBackgroundSyncCallCount()++;
}

void logError(const std::string& tag, const std::string& message) noexcept {
  std::cerr << "[" << tag << "] " << message << std::endl;
}

namespace test {
int& scheduleBackgroundSyncCallCount() {
  static int count = 0;
  return count;
}
} // namespace test

// Host test double for httpExecute: no real network, tests configure the
// outcome via platform::test::setHttpExecuteResult before calling code
// under test.
namespace {
std::function<HttpOutcome(const HttpRequest&)>& httpExecuteHandler() {
  static std::function<HttpOutcome(const HttpRequest&)> handler;
  return handler;
}
} // namespace

namespace test {
void setHttpExecuteResult(std::function<HttpOutcome(const HttpRequest&)> handler) {
  httpExecuteHandler() = std::move(handler);
}
} // namespace test

HttpOutcome httpExecute(const HttpRequest& request) {
  auto& handler = httpExecuteHandler();
  if (!handler) {
    throw std::runtime_error("platform_test: httpExecute called without platform::test::setHttpExecuteResult configured");
  }
  return handler(request);
}

} // namespace margelo::nitro::salvedb::platform
