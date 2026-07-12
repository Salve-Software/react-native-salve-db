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

The C++ core defines interfaces (pure virtual classes). Each platform injects its own implementation at startup.

```cpp
// C++ — defines the contract, knows nothing about the platform
class IBackgroundScheduler {
public:
    virtual void scheduleSync(int intervalSeconds) = 0;
    virtual void cancelSync() = 0;
    virtual ~IBackgroundScheduler() = default;
};

class IHttpClient {
public:
    virtual void execute(const HttpRequest& request,
                         std::function<void(HttpOutcome)> callback) = 0;
    virtual ~IHttpClient() = default;
};

class ICredentialStore {
public:
    virtual std::string getAccessToken() = 0;
    virtual std::string getRefreshToken() = 0;
    virtual void save(const std::string& accessToken, const std::string& refreshToken) = 0;
    virtual ~ICredentialStore() = default;
};
```

`HttpRequest`/`HttpResponse`/`HttpNetworkError`/`HttpOutcome` are defined in `cpp/http/HttpTypes.hpp` — `HttpOutcome` is a 2-way `variant<HttpResponse, HttpNetworkError>`: any completed exchange (including 4xx/5xx) is a `HttpResponse`, only a transport-level failure is a `HttpNetworkError`.

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
        ├── IBackgroundScheduler  ←──── Swift: BGTaskSchedulerAdapter
        │                               Kotlin: WorkManagerAdapter
        ├── IHttpClient           ←──── Swift: URLSessionAdapter
        │                               Kotlin: OkHttpAdapter
        └── ICredentialStore      ←──── Swift: KeychainAdapter
                                        Kotlin: KeystoreAdapter
```

---

## Testing benefit

Because the C++ core depends only on interfaces, the sync logic can be exercised in unit tests by injecting mock implementations — no device or OS scheduler required.
