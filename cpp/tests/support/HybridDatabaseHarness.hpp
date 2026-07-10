#pragma once

#include <hermes/hermes.h>
#include <InstallNitro.hpp>
#include <HybridObjectRegistry.hpp>
#include "TestDispatcher.hpp"
#include "../../database/HybridSalveDatabase.hpp"
#include <atomic>
#include <chrono>
#include <memory>
#include <mutex>
#include <stdexcept>
#include <string>
#include <thread>

namespace margelo::nitro::salvedb::tests {

// Boots a real Hermes runtime + real Nitro install() + a real
// HybridSalveDatabase, and lets tests run JS expressions against it exactly
// as production JS would — through the generated JSIConverter, not by
// calling C++ methods directly. Every test gets its own fresh runtime and
// its own fresh SQLite connection (a unique DatabaseManager-backed db name).
class HybridDatabaseHarness {
public:
  HybridDatabaseHarness() {
    _runtime = std::shared_ptr<facebook::jsi::Runtime>(facebook::hermes::makeHermesRuntime());
    _dispatcher = std::make_shared<TestDispatcher>();
    install(*_runtime, _dispatcher);

    // The registry is a process-wide singleton — only register once even
    // though every test constructs its own harness/runtime.
    static std::once_flag registered;
    std::call_once(registered, []() {
      HybridObjectRegistry::registerHybridObjectConstructor("SalveDatabase", []() {
        return std::make_shared<HybridSalveDatabase>();
      });
    });

    installSetImmediate();
    installNotifyDone();
  }

  // Runs `expression` (may be a Promise) and returns its JSON-stringified
  // result. Throws std::runtime_error with the JS error message on rejection.
  std::string run(const std::string& expression) {
    _done = false;
    _outcome.clear();

    std::string wrapped = "(async () => {\n"
      "  try {\n"
      "    const result = await (" + expression + ");\n"
      "    globalThis.__notifyDone('OK:' + JSON.stringify(result ?? null));\n"
      "  } catch (err) {\n"
      "    globalThis.__notifyDone('ERROR:' + (err && err.message ? err.message : String(err)));\n"
      "  }\n"
      "})();";

    _runtime->evaluateJavaScript(std::make_unique<facebook::jsi::StringBuffer>(wrapped), "harness.js");

    while (!_done) {
      if (!_dispatcher->drainOne()) {
        std::this_thread::sleep_for(std::chrono::milliseconds(1));
      }
    }

    if (_outcome.rfind("OK:", 0) == 0) return _outcome.substr(3);
    throw std::runtime_error(_outcome.substr(_outcome.find(':') + 1));
  }

private:
  void installSetImmediate() {
    auto dispatcher = _dispatcher;
    auto setImmediate = facebook::jsi::Function::createFromHostFunction(
      *_runtime, facebook::jsi::PropNameID::forAscii(*_runtime, "setImmediate"), 1,
      [dispatcher](facebook::jsi::Runtime& rt, const facebook::jsi::Value&, const facebook::jsi::Value* args, size_t) -> facebook::jsi::Value {
        auto callback = std::make_shared<facebook::jsi::Function>(args[0].asObject(rt).asFunction(rt));
        dispatcher->runAsync([&rt, callback]() { callback->call(rt); });
        return facebook::jsi::Value::undefined();
      });
    _runtime->global().setProperty(*_runtime, "setImmediate", setImmediate);
  }

  void installNotifyDone() {
    auto notifyDone = facebook::jsi::Function::createFromHostFunction(
      *_runtime, facebook::jsi::PropNameID::forAscii(*_runtime, "__notifyDone"), 1,
      [this](facebook::jsi::Runtime& rt, const facebook::jsi::Value&, const facebook::jsi::Value* args, size_t) -> facebook::jsi::Value {
        _outcome = args[0].asString(rt).utf8(rt);
        _done = true;
        return facebook::jsi::Value::undefined();
      });
    _runtime->global().setProperty(*_runtime, "__notifyDone", notifyDone);
  }

  std::shared_ptr<facebook::jsi::Runtime> _runtime;
  std::shared_ptr<TestDispatcher> _dispatcher;
  std::atomic<bool> _done{false};
  std::string _outcome;
};

} // namespace margelo::nitro::salvedb::tests
