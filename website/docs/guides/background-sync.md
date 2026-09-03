---
title: Background Sync
---

`Database.configure`'s `background` block enables a single global native background job that wakes
the sync orchestrator on its own — `WorkManager` on Android, `BGTaskScheduler` on iOS. It is one job
for the whole database, not one per schema; every `sync.enabled` schema is synced on each wake.

## Configuring the background job

```ts
background: {
  minimumInterval: 15 * 60 * 1000, // ms
  requiresNetwork: true,
  requiresCharging: false,
}
```

- **`minimumInterval`** — minimum interval between background sync wakes, in milliseconds. Omit
  `background` entirely to leave background sync disabled.
- **`requiresNetwork`** — require network connectivity for the background job to run.
- **`requiresCharging`** — require the device to be charging for the background job to run.

## Platform scheduling differs

- **Android (`WorkManager`)** — `minimumInterval` is clamped to `WorkManager`'s periodic-work floor
  of **15 minutes**. A smaller value is accepted but the OS will not fire more often than that.
- **iOS (`BGTaskScheduler`)** — `minimumInterval` is treated as an `earliestBeginDate` **hint**, not a
  guarantee: it is the earliest the OS may consider running the task, but `BGTaskScheduler` alone
  decides the actual timing based on system heuristics (battery, usage patterns, etc.). There is no
  fixed floor to clamp to; the interval is advisory.

## The JS runtime is never started

A background wake never starts the JS engine. On both platforms, the scheduler calls directly into
the native `SyncNativeEntryPoint`, which drives the same `SyncOrchestrator::triggerSyncAll` used by
`Database.syncAll()` — reading schemas, running push/pull sessions, and refreshing OAuth2 tokens on
401 (see [OAuth2 Credentials](../guides/credentials-oauth2.md)) — entirely in C++/Swift/Kotlin. No JS
bundle is loaded and no JS thread runs for a background pass; the sync contract itself is described
in [Sync](../guides/sync.md).

## iOS prerequisite

Background sync and the OAuth2 credential provider both need explicit `Info.plist` entries and
entitlements on iOS — without them the app builds and runs fine, but the background scheduler never
fires and the credential provider can't persist tokens, with no runtime error pointing at why. See
[Installation](../getting-started/installation.md) for the exact `Info.plist` keys and entitlement
setup required.
