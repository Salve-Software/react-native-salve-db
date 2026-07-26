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

TASK-011 (background scheduler) ended up following the same free-function pattern as `httpExecute`/credential storage instead of a virtual interface — consistent with the rest of this file, and simpler since each build is already single-platform.

```cpp
// C++ — cpp/platform/platform.hpp
namespace margelo::nitro::salvedb::platform {

// Called at the end of Database.configure() to (re)register the native
// job from DatabaseManager's current background config.
void scheduleBackgroundSync();

} // namespace margelo::nitro::salvedb::platform
```

```cpp
// C++ — cpp/sync/SyncNativeEntryPoint.hpp, the job handler's entry point
void wakeBackgroundSyncFromNative(); // rehydrate (if needed) + trigger sync
NativeBackgroundConstraints nativeBackgroundConstraints(); // read persisted schedule
```

Cold start (app fully killed, job wakes a fresh process) is handled by `NativeConfigStore` (`cpp/database/`): `Database.configure()` mirrors what it needs to a JSON file next to the SQLite database (not a SQLite table — the DB path isn't known until the file is read), and `DatabaseManager::reopenFromPersistedConfigIfNeeded()` rebuilds `DatabaseManager`'s in-memory state from it before the job tries to sync, with no JS involved.

```swift
// Swift (iOS) — ios/Sync/SalveDbBackgroundScheduler.swift
BGTaskScheduler.shared.register(forTaskWithIdentifier: taskIdentifier, using: nil) { task in
    // reschedule, call SalveDbSyncBridge.wakeBackgroundSync(), complete the task
}
```

```kotlin
// Kotlin (Android) — android/src/main/java/com/salvedb/SalveDbBackgroundWorker.kt
class SalveDbBackgroundWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = withContext(Dispatchers.IO) {
        // bootstrap documents dir + secure storage, call nativeWakeBackgroundSync()
    }
}
```

`platform::scheduleBackgroundSync()` reaches Kotlin the same way `platform::setSecureValue` does — a reverse JNI call from `platform_android.cpp` into a static Kotlin method — and reaches Swift directly via the generated `SalveDb-Swift.h` bridging header from `SalveDbPlatform.mm`, no JNI involved on that side.

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
        ├── platform::scheduleBackgroundSync ←── Swift: SalveDbBackgroundScheduler (BGTaskScheduler)
        │                                        Kotlin: SalveDbBackgroundScheduler (WorkManager)
        ├── platform::httpExecute ←──── Swift: HttpAdapter (URLSession) + PlatformHttp.mm
        │                                Kotlin: OkHttpAdapter + platform_android_http.cpp
        └── platform::*SecureValue←──── Swift: SalveDbPlatform.mm (Keychain)
                                         Kotlin: SalveDbSecureStorage.kt (Keystore)
```

---

## Testing benefit

Because the C++ core depends only on interfaces, the sync logic can be exercised in unit tests by injecting mock implementations — no device or OS scheduler required.
