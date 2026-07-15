# Salve DB

@rules/native-tests.md

SQLite offline-first library for React Native. The core differentiator is that the **sync engine runs 100% natively** (Swift/Kotlin + C++) — no JS initialization required in background.

## Architecture

```
TypeScript (declaration + DX)
  ├── Schema contracts (SchemaDefinition, ColumnDefinition, SyncDefinition...)
  ├── Query Builder à la Drizzle (builds SQL + params, does not execute)
  └── DX layer (hooks, Database.configure/register, InferSelectModel/InferInsertModel types)
       ↓ JSI via Nitro HybridObject
Native Core (C++ + Swift/Kotlin)
  ├── SQLite                   → executes queries, stores data, LRU prepared statement cache
  ├── Migration Engine         → auto ADD COLUMN on version diff; no DROP/RENAME
  ├── Trigger Engine           → every INSERT/UPDATE/DELETE → sync_queue automatically
  ├── Sync Queue               → persisted in SQLite
  ├── Expression Interpreter   → interprets declarative contracts ($ref, JsonPath)
  ├── HTTP Client              → REST only in MVP
  ├── Credential Provider      → OAuth2, tokens in Keychain (iOS) / Keystore (Android), refresh 100% native
  ├── Sync Orchestrator        → page loop: read queue → send → apply → advance cursor
  └── Background Scheduler     → single native job (WorkManager/BGTaskScheduler) iterating all schemas
```

The "no JS" rule applies **only to background sync**. Foreground queries: JS builds SQL, native executes.

## Declarative contracts

Schemas are declared in TypeScript (data, not functions) and interpreted by the native engine:

```ts
Database.configure({ baseUrl, credentials: { provider: "oauth2", refresh: { ... } } })
Database.register({ schema: CustomerSchema })
```

The `sync` field inside a schema defines endpoint, pagination, and background config — all interpreted natively without JS.

## Sync flow

```
Read sync_queue (up to pageSize)
  → POST /sync/customers  { cursor, operations, pageSize }
  → Apply received operations to SQLite (with _sync_apply_lock to avoid re-queuing)
  → Advance cursor
  → hasMore && pages < maxPagesPerSession? → repeat | end session
```

`_sync_apply_lock`: single-row table checked by triggers via `WHEN NOT EXISTS (...)`. Ensures data downloaded from the server is not re-enqueued into sync_queue.

## MVP — fixed decisions

| Area | Decision |
|---|---|
| Sync strategy | `operations` only (queue-based diff via triggers) |
| Conflict | `lastWriteWins` only (compares `updatedAt`) |
| Transport | REST only |
| Direction | `bidirectional` only |
| Auth | Single global OAuth2 (`Database.configure`) — no per-schema override |
| Migrations | `ADD COLUMN` only — no DROP/RENAME |
| Retry | Fixed: 3 attempts, 5s delay, hardcoded in native engine |
| Pagination | `pageSize` + `hasMore` + `maxPagesPerSession` (default 20) — no page tokens |
| Query layer | select/insert/update/delete, where/orderBy/limit/offset, transactions, raw SQL escape hatch |
| `datetime` | mapped to `number` (epoch millis) — no timezone ambiguity |

## Task status

Tracked as GitHub issues in `Salve-Software/react-native-salve-db` (#2–#16); `docs/tasks/README.md` mirrors the same numbering.

Done: TASK-001 (TS contracts), TASK-002 (Nitro spec), TASK-003 (test harness), TASK-004 (SQLite core), TASK-005 (migration engine), TASK-006 (Trigger Engine & Sync Queue), TASK-007 (query executor), TASK-008 (expression interpreter), TASK-009 (credential provider), TASK-010 (HTTP client), TASK-012 (Sync Orchestrator — `triggerSync`/`triggerSyncAll` fully implemented, not a stub), TASK-013 (TS query builder — Drizzle-style `select/insert/update/delete`), TASK-014 (public `Database.configure/register` API), TASK-016 (wire `triggerSync` into app lifecycle: manual sync, app-open trigger, native connectivity monitor) — all implemented with real JSI/Jest test coverage, no mocks.

Not started: TASK-011 (background scheduler), TASK-015 (README rewrite).
