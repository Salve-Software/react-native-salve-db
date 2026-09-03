---
title: Testing
---

Salve DB is covered by four independent suites, split along the same lines as the
[architecture](./architecture.md): native core, TypeScript DX layer, full on-device stack,
and platform shims.

| Suite | Command | What it covers |
|---|---|---|
| Native core | `npm run test:native` | C++ engine end-to-end through a real Hermes JSI runtime (Catch2, ~1s, no simulator) |
| TypeScript unit | `npm test` | Query builders, condition compiler, cache, hooks, provider (Jest) |
| On-device harness | `npm run test:harness:ios` / `npm run test:harness:android` | Full JSI stack on a simulator/emulator via `react-native-harness`, including real sync against `salve-db-server` |
| Platform native unit | `npm run test:native:ios` / `npm run test:native:android` | Swift (`swift test`) and Kotlin (Gradle/JUnit) unit tests |

## Native core — `npm run test:native`

This is the suite that exercises the real database engine: `HybridSalveDatabase`, the
`SQLiteConnection`, the Migration Engine, Trigger Engine, and Sync Orchestrator, all driven
through the actual JSI bridge rather than a mock. It runs against a real Hermes runtime
hosted in a C++ test binary (`cpp/tests/`), with no simulator, emulator, or React Native
app involved — that's what keeps it at roughly a second. The core links a fake
`platform::*` implementation (`cpp/tests/support/platform_test.cpp`) instead of the real
iOS/Android one, so it never touches Keychain/Keystore, `BGTaskScheduler`/`WorkManager`, or
a live network — see [Architecture](./architecture.md#why-c-core--swiftkotlin-on-the-edges-not-100-either) for why that
substitution is possible without faking the business logic itself.

Run this after **any** change under `cpp/`. It's not optional — new or changed native
behavior needs a new or changed test in the same change, mirroring `cpp/`'s own layout
under `cpp/tests/` (`cpp/database/*` → `cpp/tests/database/`, `cpp/query/*` →
`cpp/tests/query/`, `cpp/sync/*` → `cpp/tests/sync/`).

## TypeScript unit — `npm test`

Jest tests for everything that lives purely in the DX layer: the query builder's SQL/param
compilation, the condition operators (`eq`, `like`, `inArray`, ...), the prepared-statement
cache key logic, `useQuery`/`useInfiniteQuery`, and `<SalveDbProvider>`. These tests don't
touch SQLite or JSI — they assert on what gets built and passed down, not on execution.

Run this when changing anything under `src/` — the query builder, hooks, provider, or
public `Database` API surface.

## On-device harness — `npm run test:harness:ios` / `:android`

The only suite that runs the full stack end-to-end on a real simulator/emulator via
[`react-native-harness`](https://github.com/callstack/react-native-harness): TypeScript →
JSI → C++ core → real platform shim (Keychain/Keystore, `URLSession`/`OkHttp`) → a live
`salve-db-server` instance for actual push/pull sync. This is the only suite that can catch
platform-shim wiring bugs (e.g. a JNI call that compiles but never reaches the Kotlin side)
or a sync contract mismatch against a real server.

Run this before releasing, or when changing anything that crosses the C++ ↔ Swift/Kotlin
boundary, background scheduling, or the sync REST contract — see
[docs/sync-rest-contract.md](https://github.com/Salve-Software/react-native-salve-db/blob/main/docs/sync-rest-contract.md)
for the contract itself.

## Platform native unit — `npm run test:native:ios` / `:android`

Plain `swift test` (iOS) and Gradle/JUnit (Android) unit tests scoped to the Swift/Kotlin
shims themselves — background scheduler registration, HTTP adapter behavior, secure storage
wrappers — without going through JSI or a full app. Useful for iterating on one platform's
shim in isolation before running the slower on-device harness.

Run this when changing `ios/` or `android/` shim code directly.

## Practical guidance

- Touching `cpp/`: run `npm run test:native` — required, not optional.
- Touching `src/`: run `npm test` (and `npm run typecheck`).
- Touching `ios/`/`android/` platform shims: run the matching `test:native:ios`/`:android`
  suite first, then the on-device harness before merging.
- Preparing a release, or touching sync/background/credential wiring across the JSI or
  platform boundary: run the on-device harness for both platforms.
