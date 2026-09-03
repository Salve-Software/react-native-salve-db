---
title: Introduction
sidebar_label: Introduction
---

Salve DB is an offline-first SQLite database for React Native. You declare your tables and their REST
sync contract as plain TypeScript data; a native C++/Swift/Kotlin core creates the tables, migrates
them, installs SQLite triggers that queue every local write, and pushes/pulls against your own REST
API — including OAuth2 token refresh — **without the JS engine ever being started**. A background job
(`WorkManager` on Android, `BGTaskScheduler` on iOS) wakes the native sync orchestrator on its own;
your app doesn't need to be open.

In the foreground you get a Drizzle-style typed query builder plus `useQuery` / `useInfiniteQuery`
hooks that re-render automatically whenever a table changes — no matter whether the write came from
your own code, raw SQL, a migration, or the background sync engine.

## Why native sync matters

A sync engine implemented in JS has to run inside a headless JS task to do anything in the background
— on iOS that means bridging `BGTaskScheduler` callbacks into a JS context that may not even be alive,
and on Android a `WorkManager` job that has to boot a full JS runtime before it can make a single HTTP
request. Both cost real time and battery just to get the JS engine started, and both are subject to
whatever the OS decides about JS-thread scheduling under background execution limits — a class of
reliability bug that Salve DB simply doesn't have.

Salve DB's sync orchestrator, HTTP client, credential provider, and background scheduler live entirely
in C++/Swift/Kotlin:

- **Background reliability** — the OS wakes native code directly (`SyncNativeEntryPoint`); there's no
  JS bundle to load, no bridge to reconnect, no headless task that can be killed mid-sync because the
  JS runtime took too long to initialize.
- **Battery** — no JS VM startup, no bridge serialization for every queued operation — the sync loop
  reads SQLite, executes HTTP requests, and applies results, all in native code.
- **Correctness under cold start** — if the OS kills your app entirely and later wakes the background
  job in a fresh process, the native core rehydrates its state from a small persisted config file and
  runs the sync pass with no JS involved at all.

In the foreground, the same orchestrator is reachable from JS via `Database.sync()` /
`Database.syncAll()`, and every local write — whether from your query builder, raw SQL, a migration, or
sync itself — goes through the same SQLite triggers into one `sync_queue`, so there's no separate
in-JS bookkeeping to keep in sync with the native state.

## Architecture at a glance

```text
TypeScript (DX layer)  →  JSI (Nitro Modules)  →  Native Core (C++)  →  Swift (iOS) / Kotlin (Android)
```

- **TypeScript** — `Database.configure/register`, the query builder (`select`/`insert`/`update`/
  `delete`/`transaction`), `useQuery`/`useInfiniteQuery`, `<SalveDbProvider>`.
- **JSI (Nitro Modules)** — a zero-copy bridge between JS and the native core; foreground calls cross
  it synchronously, and native change events cross it back to trigger React re-renders.
- **Native Core (C++)** — SQLite execution with a prepared-statement cache, the migration engine, the
  trigger engine that populates `sync_queue`, and the sync orchestrator.
- **Swift / Kotlin edges** — the platform APIs the C++ core can't reach directly: `BGTaskScheduler` /
  `WorkManager` for background scheduling, `URLSession` / `OkHttp` for HTTP, Keychain / Keystore for
  OAuth2 token storage.

See [Architecture](./architecture.md) for the full breakdown of each layer.

## What's next

Head to [Installation](getting-started/installation.md) to add Salve DB to your app, then follow the
[Quick Start](getting-started/quick-start.md) to define a schema and run your first query.
