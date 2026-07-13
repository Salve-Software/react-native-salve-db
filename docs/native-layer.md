# Native Layer Architecture

## Decision: C++ core + Swift/Kotlin on the edges

The native layer is split into two tiers based on whether a component depends on platform APIs.

| Tier | Language | Components |
|---|---|---|
| Core | C++ | SQLite execution, sync queue, expression interpreter, migration engine, conflict resolution |
| Platform edges | Swift (iOS) / Kotlin (Android) | Background scheduler, HTTP client, credential storage |

### Why not 100% C++

The components in the "platform edges" tier are bound to OS APIs that have no C++ bindings:

- **Background scheduling** — `BGTaskScheduler` (iOS) and `WorkManager` (Android) are Swift/Kotlin APIs. Bridging them via JNI or ObjC runtime is fragile and error-prone, especially for lifecycle callbacks.
- **Credential storage** — Keychain (iOS) and Keystore (Android) have no C++ bindings.
- **HTTP client** — bundling `libcurl` adds weight and manual TLS config. `URLSession` and `OkHttp` already handle proxy, cert pinning, and platform quirks.

### Why not 100% Swift/Kotlin

The core logic (sync queue, expression interpreter, conflict resolution) has no platform dependencies and benefits from being written once in C++ — avoiding duplicated business logic across two platforms.

---

## Contract pattern

The C++ core declares free functions in `namespace platform` (`cpp/platform/platform.hpp`) — not virtual classes, since each build is single-platform and there's no runtime polymorphism to gain. Each platform links its own implementation (`ios/SalveDbPlatform.mm` / `PlatformHttp.mm`, `android/src/main/cpp/platform_android*.cpp`) at build time. The C++ host test suite (`cpp/tests`) links a third implementation, `platform_test.cpp`, as a fake.

```cpp
// C++ — cpp/platform/platform.hpp, no platform dependency
namespace margelo::nitro::salvedb::platform {

std::string getSecureValue(const std::string& key);
void setSecureValue(const std::string& key, const std::string& value);

// Blocks the calling thread until the request completes — only call from a
// native background thread (e.g. inside Promise<T>::async), never from JS.
HttpOutcome httpExecute(const HttpRequest& request);

} // namespace margelo::nitro::salvedb::platform
```

`IBackgroundScheduler` below is still the planned shape for TASK-011 (not implemented yet) — it may end up following the same free-function pattern instead of a virtual class once that task starts, for consistency with `httpExecute`/credential storage.

```cpp
class IBackgroundScheduler {
public:
    virtual void scheduleSync(int intervalSeconds) = 0;
    virtual void cancelSync() = 0;
    virtual ~IBackgroundScheduler() = default;
};
```

```swift
// Swift (iOS) — implements IBackgroundScheduler
class BGTaskSchedulerAdapter: IBackgroundSchedulerProtocol {
    func scheduleSync(_ intervalSeconds: Int32) {
        // BGTaskScheduler registration + submit
    }
    func cancelSync() {
        // BGTaskScheduler cancel
    }
}
```

```kotlin
// Kotlin (Android) — implements IBackgroundScheduler
class WorkManagerAdapter(context: Context) : IBackgroundScheduler {
    override fun scheduleSync(intervalSeconds: Int) {
        // WorkManager PeriodicWorkRequest
    }
    override fun cancelSync() {
        // WorkManager cancelUniqueWork
    }
}
```

The `SyncOrchestrator` in C++ holds pointers to these interfaces and never knows which platform it is running on.

---

## Layer diagram

```
TypeScript (JS thread)
  └── JSI / Nitro HybridObject
        ↓
C++ Core
  ├── SQLiteExecutor
  ├── SyncQueue
  ├── ExpressionInterpreter
  ├── MigrationEngine
  ├── ConflictResolver (lastWriteWins)
  └── SyncOrchestrator
        ├── IBackgroundScheduler   ←──── Swift: BGTaskSchedulerAdapter (not implemented yet, TASK-011)
        │                                Kotlin: WorkManagerAdapter (not implemented yet, TASK-011)
        ├── platform::httpExecute ←──── Swift: HttpAdapter (URLSession) + PlatformHttp.mm
        │                                Kotlin: OkHttpAdapter + platform_android_http.cpp
        └── platform::*SecureValue←──── Swift: SalveDbPlatform.mm (Keychain)
                                         Kotlin: SalveDbSecureStorage.kt (Keystore)
```

---

## Testing benefit

Because the C++ core depends only on interfaces, the sync logic can be exercised in unit tests by injecting mock implementations — no device or OS scheduler required.
