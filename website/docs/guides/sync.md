---
title: Sync
---

Sync is declared per schema as data (`ISyncDefinition`), interpreted entirely by the native engine.
There is no JS sync loop — `Database.sync()`/`Database.syncAll()` just ask the native orchestrator to
run a session; the same orchestrator is woken directly from native code on app open and in the
background (see [Background Sync](../guides/background-sync.md)).

## `ISyncDefinition`

```ts
interface ISyncDefinition {
  enabled: boolean;
  direction: SyncDirection;       // MVP: "bidirectional" only
  conflict: ConflictConfig;
  transport: Transport;           // MVP: "rest" only
  endpoint: IEndpointDefinition;
  background?: IBackgroundDefinition;
  pagination?: IPaginationDefinition;
}
```

- **`enabled`** — gates whether this schema participates in sync at all: manual `Database.sync()`,
  `syncOnAppOpen`, and the background wake all skip a schema with `enabled: false`.
- **`direction`** — only `"bidirectional"` is implemented in the MVP.
- **`conflict`** — how a pulled server row is reconciled against an existing local row. See
  [Conflict strategies](#conflict-strategies) below.
- **`transport`** — only `"rest"` is implemented in the MVP.
- **`endpoint`** — the REST module contract for this entity (base path, path/query templates,
  cursor field, extra headers). See [`IEndpointDefinition`](#iendpointdefinition).
- **`background`** — `{ enabled: boolean }`, intended to gate whether this schema participates in the
  background wake. Not yet consulted natively: `Database.syncAll()`'s background counterpart
  (`triggerSyncAll`) currently runs every `sync.enabled` schema regardless of this flag. Global
  background scheduling (interval, network/charging requirements) is configured once via
  `Database.configure({ background })` — see [Background Sync](../guides/background-sync.md).
- **`pagination`** — pull page size and per-session page cap. Optional; falls back to the engine's
  own defaults when omitted.

```ts
sync: {
  enabled: true,
  direction: 'bidirectional',
  conflict: { strategy: 'lastWriteWins' },
  transport: 'rest',
  endpoint: {
    basePath: '/users',
    listQueryTemplate: 'updatedAfter={since}&limit={limit}',
  },
  pagination: { pageSize: 50, maxPagesPerSession: 20 },
}
```

## `IEndpointDefinition`

```ts
interface IEndpointDefinition {
  basePath: string;
  itemPathTemplate?: string;      // default: "{basePath}/{id}"
  listQueryTemplate: string;
  cursorField?: string;           // default: "updatedAt"
  headers?: Record<string, string>;
}
```

- **`basePath`** — base path of the entity's REST module, e.g. `/users`. Every route the engine
  calls is relative to it: `GET <basePath>` (list), `POST <basePath>` (create), and — by default —
  `PATCH`/`DELETE <basePath>/:id` (update/delete).
- **`itemPathTemplate`** — template for the single-item route used by `PATCH`/`DELETE`, e.g.
  `"{basePath}({id})"` for an OData-style API. Tokens: `{basePath}`, `{id}` (`{id}` is always
  percent-encoded; `{basePath}` is inserted raw). Defaults to `"{basePath}/{id}"`.
- **`listQueryTemplate`** — template for the pull's query string, e.g.
  `"updatedAfter={since}&limit={limit}"`, or a composed filter such as
  `"$filter={cursorField} gt {since}&$top={limit}"`. Tokens: `{since}`, `{limit}`, `{cursorField}`
  (all percent-encoded). Required — there is no fallback; every schema declares its own query shape
  explicitly. This is a closed `{token}` vocabulary, deliberately not RFC 6570.
- **`cursorField`** — the field name (in each pulled row's JSON) carrying that row's timestamp, read
  from the last row of a page to advance the incremental-pull cursor. Required regardless of
  `sync.conflict.strategy` — pagination needs it independent of how conflicts get resolved. Defaults
  to `"updatedAt"`.
- **`headers`** — extra headers merged into every request for this entity.

## `IPaginationDefinition`

```ts
interface IPaginationDefinition {
  pageSize: number;
  maxPagesPerSession?: number;    // default: 20
}
```

- **`pageSize`** — items per pull page, rendered into `listQueryTemplate`'s `{limit}` token. Push has
  no batching concept — each queued item is its own HTTP call regardless of this value.
- **`maxPagesPerSession`** — max pull pages per sync session (same connectivity window). Prevents a
  long loop from draining battery in a single scheduler wake. When the cap is reached with a page
  still full, the engine stops and resumes from the already-advanced cursor on the next wake.
  Defaults to `20`.

## Conflict strategies

`conflict` is a discriminated union on `strategy`:

- **`lastWriteWins`** (most common) — whichever side has the newer value in a configurable timestamp
  column wins.

  ```ts
  conflict: { strategy: 'lastWriteWins', field: 'updatedAt' } // field is optional, defaults to "updatedAt"
  ```

  `field` names a column declared in the schema's own `columns` (and present in the API payload).
  Configurable so an API's own naming convention can be used instead of forcing `updatedAt`. It must
  reference a column declared as `{ type: "datetime", nullable: false }` — `Database.register()`
  throws at registration time if it doesn't, since a nullable or non-datetime column can't be
  compared as a timestamp.

- **`serverWins`** — the server's pulled row always overwrites the local row, regardless of any local
  edit.

  ```ts
  conflict: { strategy: 'serverWins' }
  ```

- **`clientWins`** — an existing local row is never overwritten by a pulled server row; a row that
  doesn't exist locally yet still gets inserted.

  ```ts
  conflict: { strategy: 'clientWins' }
  ```

- **`manual`** is not implemented in the MVP.

Note: `conflict`'s strategy is unrelated to `endpoint.cursorField` — the cursor field is always
required for incremental pagination, independent of which conflict strategy is chosen.

## The sync session algorithm

A `triggerSync(schemaName)` session (invoked by `Database.sync()`, `Database.syncAll()`,
`syncOnAppOpen`, or the background wake) runs two phases, in order. Full detail, including retry and
tombstone semantics, is in [`docs/sync-rest-contract.md`](https://github.com/Salve-Software/react-native-salve-db/blob/main/docs/sync-rest-contract.md) on GitHub.

```text
PHASE 1 — Push (drains the whole sync_queue, sequentially, FIFO)
│
├─ insert → POST <basePath>     update → PATCH <basePath>/:id     delete → DELETE <basePath>/:id
│
├─ 2xx? → insert/update: response Entity replaces the row (rewrites entityId, cascades FK
│         children, marks metadata SYNCED); delete (204): marks metadata SYNCED
├─ HTTP failure (400/404/409/500)? → item marked FAILED (retryCount++), moves to the next item
└─ network failure? → aborts the rest of PHASE 1 immediately; unprocessed items stay PENDING and
     are retried next session

PHASE 2 — Pull (loop of pages; only runs if PHASE 1 did not abort on a network failure)
│
├─ GET <basePath>?<listQueryTemplate rendered>
├─ each row: deletedAt != null → local tombstone; exists locally → update (lastWriteWins by
│   updatedAt, or per the configured conflict strategy); else → insert
├─ advance cursor = deletedAt ?? updatedAt of the last row in the page
└─ page came back full (== pageSize) && pages < maxPagesPerSession?
     ├─ yes → repeat PHASE 2
     └─ no → end session (resumes from the persisted cursor next time)
```

Push runs before pull: your own local changes are sent before asking "what changed since X" — not
strictly required (re-applying your own row via pull is an idempotent no-op), but it is the more
intuitive order and avoids a window where a pull could bring back a state the push is about to
replace.

Every HTTP call (`POST`/`PATCH`/`DELETE`/`GET` page) gets its own retry budget: 3 attempts, 5s delay,
fixed in the native engine — not configurable per schema. Every session retries any `PENDING` or
`FAILED` queue item, so a transient failure resolves itself on the next session without any user
action.

## Triggering sync from JS

```ts
await Database.sync('users');   // one schema
await Database.syncAll();       // every sync-enabled schema
```

Sync also runs automatically:

- **On app open** — controlled by `Database.configure({ syncOnAppOpen })`, which defaults to `true`.
  Set it to `false` to opt out of the automatic sync when the app returns to the foreground.
- **In the background** — see [Background Sync](../guides/background-sync.md) for the native
  scheduler, its `Database.configure({ background })` options, and platform floors.

Authentication for every sync request is handled by the credentials block configured once via
`Database.configure` — see [OAuth2 Credentials](../guides/credentials-oauth2.md).
