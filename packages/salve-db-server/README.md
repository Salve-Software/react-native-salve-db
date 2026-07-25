# salve-db-server

Reference REST backend showing the exact API shape `react-native-salve-db`'s sync engine is meant to consume. Small, conventional, in-memory — read it end to end as "this is the shape your own API needs to have." A reference/example only (`private: true`), never published to npm.

> The native sync engine in this repo has not been migrated to speak this contract yet (`cpp/sync/`) — that's a separate, later step. This package exists first, as the concrete target for that rewrite.

## Running it

From the repo root:

```bash
npm install
npm run dev -w salve-db-server      # tsx watch, restarts on save
# or
npm run build -w salve-db-server && npm run start -w salve-db-server
```

Listens on `PORT` (default `4000`). State is entirely in-memory — restarting the process wipes everything.

## Testing

```bash
npm run test -w salve-db-server
```

Uses Node's built-in test runner (`node:test` + `node:assert/strict`) and [supertest](https://github.com/forwardemail/supertest) — no Jest, consistent with the rest of this package's minimal-dependency philosophy. Supertest sends real HTTP requests against an in-process Express app (no port binding needed) and asserts on the actual status code/body, exercising the real routing + middleware, not a re-implementation of it.

Every integration test builds its own isolated app via `mountModule(createUsersModule(new ResourceStore()))` (or `createProductsModule`) in a `beforeEach` — a fresh store per test, never the shared production singleton, so tests can't leak state into each other or depend on run order.

```
src/rest/tests/       # unit tests: ResourceStore + validation helpers, no HTTP
src/users/tests/      # supertest integration tests against an isolated /users app
src/products/tests/   # same, for /products — plus the per-module param-name proof
src/tests/            # integration tests against the fully assembled app (createServer),
                       # proving the two modules' query param names don't leak into each other
```

`createServer(modules?)` and each module's `create<Entity>Module(store)` factory both exist specifically to make this possible — production code (`src/index.ts`) calls them with no arguments (the real shared stores); tests call them with fresh ones.

## The contract

Per entity module (e.g. `users`, mounted at `/users`):

| Action | Route | Response |
|---|---|---|
| List (initial or incremental pull) | `GET /<base>?<sinceParam>=<epochMillis>&<limitParam>=<n>` | `Entity[]` — a bare array. No envelope, no pagination header. Ordered `(updatedAt ASC, id ASC)`. Fewer than `<limitParam>` items returned = last page. |
| Get one | `GET /<base>/:id` | `Entity`, or `404` if missing **or deleted**. |
| Create | `POST /<base>` | `201` + the created `Entity`. Body is just the entity's own fields — no correlation id of any kind. |
| Update | `PATCH /<base>/:id` | `200` + the updated `Entity`. `404` if missing or deleted. |
| Delete | `DELETE /<base>/:id` | `204`, empty body. `404` on a second delete of the same id. Never a hard delete — the store keeps a tombstone. |

## Incremental pull

The cursor is a plain epoch-millisecond number, exclusive (`updatedAt > since`) — same convention `updatedAt`/`datetime` columns already use everywhere else in this project. Rows are ordered `(updatedAt, id)`; the `id` tie-break exists because two writes can land in the same millisecond, and without a stable secondary sort a naive `updatedAt`-only cursor can skip or duplicate rows at a page boundary.

A short page (fewer rows than the requested limit) **is** the "no more pages" signal — there's no `hasMore` field, no envelope, no header to check.

A consumer advances its own cursor with `row.deletedAt ?? row.updatedAt` — uniform across both live rows (always carry `deletedAt: null`) and tombstones (no `updatedAt` at all).

## Tombstones

A deleted row collapses to `{ id, deletedAt }` — no other fields — and shows up mixed into the same array a normal `GET /<base>` list returns. The discriminator is simply whether `deletedAt` is non-null; every live row also carries `deletedAt`, always `null`, so the field is uniform across every element, never something that "sometimes exists."

Tombstones are **list-only**. `GET /<base>/:id` on a deleted resource returns `404`, exactly like it never existed.

## Per-module query param names

Not a hardcoded global convention — the whole point is minimizing what an adopter's existing API needs to change to match. Each module configures its own names:

| Module | `since` param | `limit` param | default limit | max limit |
|---|---|---|---|---|
| `users` | `updatedAfter` | `limit` | 50 | 200 |
| `products` | `modified_since` | `page_size` | 25 | 100 |

Nothing in `src/rest/` knows either set of names — they're the only two places these strings appear (`src/users/handler.ts`, `src/products/handler.ts`). A param name from one module is silently ignored by the other (e.g. `GET /products?limit=1` doesn't do anything — `products` only recognizes `page_size`).

## Design decisions worth knowing

- **No `localId` / correlation field anywhere.** Every push (create/update/delete) is its own HTTP call now, not a batched operation — the caller already knows what it sent, so there's nothing to echo back for correlation.
- **A second `DELETE` of the same id is a real `404`, not a silent `204`.** The row still exists as a tombstone, so the server can genuinely tell "already deleted" apart from "never existed" — collapsing them would hide a real client-side bug (double-pushing a delete).
- **An empty `PATCH` body is `400`, not a no-op `200`.** A write with zero fields would still bump `updatedAt` and put a meaningless row in front of every other client's next incremental pull.
- **A malformed `:id` (e.g. `/users/abc`) is `404`, not `400`.** Ids are opaque to the client — "not a valid id" and "no such id" are indistinguishable from outside, and treating both as `404` keeps consumer code simpler.
- **No admin/seed/debug routes.** This isn't a test harness — it's meant to read like a real API. Simulating "someone else wrote to the server" is just calling `POST`/`PATCH` directly.

## Swapping the in-memory store for a real database

`src/<entity>/store.ts` is the entire seam. `ResourceStore`'s five methods (`list`, `get`, `create`, `update`, `remove`) are the whole port surface — `list`'s filter+sort maps directly to:

```sql
SELECT * FROM <table> WHERE cursor_key > ? ORDER BY updated_at, id LIMIT ?
```

where `cursor_key` is `updated_at` for a live row and `deleted_at` for a tombstone (a generated/computed column, or just `COALESCE(deleted_at, updated_at)` at query time).

## Layout

```
src/
├── index.ts          # entrypoint: creates the server, listens, logs
├── server.ts          # Express app assembly: json parser, mounts modules, 404 + error handling
├── rest/               # generic REST-resource behavior, shared by every module
│   ├── types.ts
│   ├── store.ts         # ResourceStore<TEntity> — the in-memory data layer
│   ├── resource.ts       # createResourceModule<TEntity>(config) — the router factory
│   ├── validation.ts     # manual field validation helpers (no external library)
│   ├── middleware.ts     # notFoundHandler / jsonErrorHandler, shared by server.ts and tests
│   └── tests/            # unit tests for store.ts + validation.ts
├── testing/
│   └── mountModule.ts     # test-only helper: one module + real middleware, no full server
├── users/
│   ├── user.ts            # IUser + input validation
│   ├── store.ts            # ResourceStore<IUser> instance
│   ├── handler.ts           # createUsersModule(store) factory + the production usersModule
│   └── tests/                # supertest integration tests for /users
├── products/
│   ├── product.ts
│   ├── store.ts
│   ├── handler.ts
│   └── tests/
└── tests/
    └── server.test.ts        # integration tests for the fully assembled app
```

Adding a third entity is one new folder plus one line in `server.ts` — nothing in `rest/` changes.
