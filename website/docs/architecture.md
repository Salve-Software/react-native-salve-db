---
title: Architecture
---

Salve DB splits into three layers: a TypeScript DX layer, a C++ native core, and thin
Swift/Kotlin platform shims. Everything below the TypeScript layer — sync orchestration,
HTTP, credentials, background scheduling — runs without starting the JS runtime.

```text
┌───────────────────────────────┐        JSI (Nitro Modules)        ┌────────────────────────────────────┐
│      TypeScript (DX layer)      │ ─────────────────────────────────▶ │        Native Core (C++)            │
│                                 │                                    │                                      │
│  Database.configure/register   │                                    │  SQLite + LRU statement cache        │
│  Query Builder (select/insert  │                                    │  Migration Engine (ADD COLUMN)       │
│    /update/delete/transaction) │ ◀───────────────────────────────── │  Trigger Engine → sync_queue         │
│  useQuery / useInfiniteQuery   │        reactive change events      │  Sync Orchestrator (push → pull)     │
│  <SalveDbProvider>              │                                    │  Credential Provider (OAuth2)        │
└───────────────────────────────┘                                    │  HTTP Client                         │
                                                                       └──────────────────┬───────────────────┘
                                                                                          │
                                                              ┌───────────────────────────┴───────────────────────────┐
                                                              │        Swift (iOS) / Kotlin (Android) shims             │
                                                              │  BGTaskScheduler / WorkManager — background scheduler   │
                                                              │  NWPathMonitor / ConnectivityManager — network monitor  │
                                                              │  Keychain / Keystore — secure token storage             │
                                                              └───────────────────────────┬───────────────────────────┘
                                                                                          ▼
                                                                                  Your REST API
```

The background scheduler wakes `SyncNativeEntryPoint` directly from native code — the JS
runtime is never started for a background sync pass. In the foreground, the same
orchestrator is reachable from JS via `Database.sync()` / `Database.syncAll()`.

## TypeScript — the DX layer

TypeScript owns declaration and developer experience only; it never executes queries or
touches the network itself:

- **Schema contracts** — `SchemaDefinition`, `ColumnDefinition`, `IndexDefinition`,
  `RelationDefinition`, `SyncDefinition` describe tables, indexes, relations, and sync
  behavior as plain data, interpreted natively.
- **Query Builder** — a Drizzle-style `select/insert/update/delete` builder. It only
  compiles SQL + params; execution happens in C++ over JSI.
- **DX layer** — `Database.configure/register`, `useQuery`/`useInfiniteQuery`,
  `<SalveDbProvider>`, `InferSelectModel`/`InferInsertModel` types.

The bridge to native is a Nitro `HybridObject`, so calls cross JSI directly — no bridge
serialization, no async round trip through a message queue.

## C++ — the native core

The core owns everything that has no platform dependency:

- **SQLite execution** with an LRU prepared-statement cache.
- **Migration Engine** — creates tables on first run, applies `ADD COLUMN` diffs on
  `schema.version` bumps. See [Migrations](./guides/migrations.md).
- **Trigger Engine** — every `INSERT`/`UPDATE`/`DELETE` on a synced table fires a SQLite
  trigger that enqueues a row into `sync_queue`, so nothing besides a SQL trigger has to
  remember to queue a change.
- **Sync Orchestrator** — drives the push → pull loop against `sync_queue`, advances the
  server cursor, and applies conflict resolution (`lastWriteWins`/`serverWins`/`clientWins`).
- **Credential Provider** — holds the OAuth2 token lifecycle in memory and calls out to the
  platform shim to persist/read the actual secret.
- **HTTP Client** — builds the sync request/response cycle against `platform::httpExecute`.

## Swift / Kotlin — platform edges

A thin shim per platform implements the handful of functions the C++ core cannot: OS
background jobs, connectivity monitoring, and secure storage. Nothing here contains
business logic — it's wiring.

| Concern | iOS | Android |
|---|---|---|
| Background scheduler | `BGTaskScheduler` | `WorkManager` |
| Network monitor | `NWPathMonitor` | `ConnectivityManager` |
| Secure token storage | Keychain | Keystore |

## Why C++ core + Swift/Kotlin on the edges, not 100% either

The split is drawn along one line: does a component depend on an OS API that has no C++
binding?

**Why not 100% C++.** The platform-edge components are bound to OS APIs with no C++
surface:

- `BGTaskScheduler` (iOS) and `WorkManager` (Android) are Swift/Kotlin-only APIs — bridging
  their lifecycle callbacks through JNI or the ObjC runtime is fragile compared to writing
  the shim natively on each platform.
- Keychain (iOS) and Keystore (Android) have no C++ bindings for secure storage.
- Bundling `libcurl` for HTTP would mean hand-rolling proxy support, cert pinning, and TLS
  config that `URLSession` and `OkHttp` already handle correctly.

**Why not 100% Swift/Kotlin.** The core logic — sync queue, expression interpreter,
conflict resolution, migration engine — has no platform dependency. Writing it once in
C++ avoids maintaining two parallel implementations of the same business logic that would
inevitably drift.

**The contract pattern.** The C++ core declares free functions in `namespace platform`
(`cpp/platform/platform.hpp`) rather than a virtual interface — each build is
single-platform, so there's no runtime polymorphism to gain from a class hierarchy. Each
platform links its own implementation at build time: `ios/SalveDbPlatform.mm` /
`PlatformHttp.mm` on iOS, `android/src/main/cpp/platform_android*.cpp` on Android (calling
back into Kotlin via JNI for scheduling and secure storage). The background scheduler
(`platform::scheduleBackgroundSync`) follows the same free-function pattern as
`httpExecute` and the credential functions:

```cpp
// cpp/platform/platform.hpp — no platform dependency
namespace margelo::nitro::salvedb::platform {

std::string getSecureValue(const std::string& key);
void setSecureValue(const std::string& key, const std::string& value);

// Blocks the calling thread until the request completes — only call from a
// native background thread (e.g. inside Promise<T>::async), never from JS.
HttpOutcome httpExecute(const HttpRequest& request);

// Called at the end of Database.configure() to (re)register the native
// job from the current background config.
void scheduleBackgroundSync();

} // namespace margelo::nitro::salvedb::platform
```

Cold starts (app fully killed, the OS job wakes a fresh process) are handled without JS:
`Database.configure()` mirrors what the sync engine needs into a JSON file next to the
SQLite database (a file, not a SQLite table, because the DB path itself isn't known until
that file is read), and the native layer rebuilds its in-memory state from it before the
job tries to sync.

**The testing benefit.** Because the core only depends on the `platform::*` function
contracts, the C++ test suite links a third implementation — a fake
(`cpp/tests/support/platform_test.cpp`) — instead of the real iOS/Android one. That's what
lets `npm run test:native` exercise the real `HybridSalveDatabase` end-to-end through a
real Hermes JSI runtime, with no simulator or emulator, in about a second. See
[Testing](./testing.md) for the full picture of which suite covers what.
