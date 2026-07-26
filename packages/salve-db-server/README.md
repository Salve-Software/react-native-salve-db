# salve-db-server

Reference REST backend showing the exact API shape `react-native-salve-db`'s sync engine is meant to consume. Small, conventional, Postgres-backed — read it end to end as "this is the shape your own API needs to have." A reference/example only (`private: true`), never published to npm.

> The native sync engine in this repo (`cpp/sync/`) speaks exactly this contract — see `docs/sync-rest-contract.md`.

## Running it

From the repo root:

```bash
npm install
npm run docker:up -w salve-db-server   # starts Postgres in the background (docker compose)
npm run dev -w salve-db-server         # tsx watch, restarts on save
# or
npm run build -w salve-db-server && npm run start -w salve-db-server
```

Listens on `PORT` (default `4000`), reads `DATABASE_URL` from `.env` (copy `.env.example`) or falls back to the default matching `docker-compose.yml`'s credentials. State lives in Postgres — restarting the server process (or `tsx watch` reloading on save) no longer wipes anything; `npm run docker:down -w salve-db-server` stops the container but keeps the `salve_db_server_data` volume, so data survives that too. Only `docker compose down -v` (dropping the volume explicitly) wipes it.

## Testing

```bash
npm run test -w salve-db-server
```

Uses Node's built-in test runner (`node:test` + `node:assert/strict`) and [supertest](https://github.com/forwardemail/supertest) — no Jest, consistent with the rest of this package's minimal-dependency philosophy. Supertest sends real HTTP requests against an in-process Express app (no port binding needed) and asserts on the actual status code/body, exercising the real routing + middleware, not a re-implementation of it.

Tests don't need Docker or a running Postgres. Every test gets a fresh, isolated instance of [`@electric-sql/pglite`](https://pglite.dev) — a real Postgres compiled to WASM, running in-process — via `createTestExecutor()` (`src/testing/testDb.ts`), which runs the same `docker/init.sql` schema the real container uses. Real SQL, real constraints, no server to start — just slower than the old in-memory store (WASM startup per test), a deliberate trade for testing against the real engine instead of a hand-rolled mock.

Every integration test builds its own isolated app via `mountModule(createUsersModule(new PostgresResourceStore(await createTestExecutor(), {...})))` (or `createProductsModule`) in a `beforeEach` — a fresh database per test, never the shared production singleton, so tests can't leak state into each other or depend on run order.

```
src/rest/tests/       # unit tests: PostgresResourceStore (against a synthetic table) + validation helpers, no HTTP
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

## The data layer: Postgres, via a small port interface

`src/<entity>/store.ts` is the entire seam — `IResourceStore<TEntity>`'s five methods (`list`, `get`, `create`, `update`, `remove`, all `Promise`-returning) are the whole port surface (`src/rest/types.ts`). `PostgresResourceStore` (`src/rest/store.ts`) is the one implementation, parameterized by `{ table, columns }` per entity and a minimal `QueryExecutor` (`{ query(sql, params?): Promise<{ rows }> }`) — satisfied structurally by both `pg.Pool` (production, `src/db.ts`) and `@electric-sql/pglite`'s `PGlite` (tests), with neither type imported into the store itself.

`list`'s filter+sort maps directly to:

```sql
SELECT * FROM <table> WHERE COALESCE("deletedAt", "updatedAt") > $1 ORDER BY COALESCE("deletedAt", "updatedAt") ASC, "id" ASC LIMIT $2
```

Column names are quoted camelCase (`"updatedAt"`, `"deletedAt"`) — matches the JSON contract 1:1, no snake_case translation layer. `updatedAt`/`deletedAt` are `BIGINT` (epoch millis; `INTEGER` overflows around 2038) written from a monotonic clock kept in the app (`src/rest/tick.ts`), not the database's own clock — two writes landing in the same real millisecond must still get distinct, ordered cursor values, or an exclusive (`>`) cursor could skip one at a page boundary. Two known Postgres driver gotchas are handled explicitly rather than routed around: `BIGINT` returns as a `string` from `pg`/PGlite by default (coerced back to `number` in the store), and `products.price` deliberately uses `DOUBLE PRECISION` instead of `NUMERIC` to avoid the same string-coercion issue for a field where exact decimal precision doesn't matter for a reference server.

Table schema lives in `docker/init.sql` — the single source both the real Postgres container (via `docker-entrypoint-initdb.d`) and every test's fresh PGlite instance (via `createTestExecutor()`) run against.

## Layout

```
docker/
└── init.sql               # table schema — single source for the real container and every test
docker-compose.yml          # Postgres only (official image); the Node server runs local, not containerized
.env.example                # DATABASE_URL, copy to .env
src/
├── index.ts          # entrypoint: creates the server, listens, logs
├── server.ts          # Express app assembly: json parser, mounts modules, 404 + error handling
├── db.ts              # shared pg.Pool, reads DATABASE_URL
├── rest/               # generic REST-resource behavior, shared by every module
│   ├── types.ts          # IResourceStore<TEntity> — the port interface
│   ├── store.ts           # PostgresResourceStore<TEntity> — the one implementation
│   ├── tick.ts             # monotonic write clock, shared by every store instance
│   ├── resource.ts          # createResourceModule<TEntity>(config) — the async router factory
│   ├── validation.ts        # manual field validation helpers (no external library)
│   ├── middleware.ts        # notFoundHandler / jsonErrorHandler / requestLogger
│   └── tests/                # unit tests for store.ts + validation.ts (PGlite-backed)
├── testing/
│   ├── mountModule.ts     # test-only helper: one module + real middleware, no full server
│   └── testDb.ts          # createTestExecutor() — fresh PGlite instance + docker/init.sql per test
├── users/
│   ├── user.ts            # IUser + input validation
│   ├── store.ts            # PostgresResourceStore<IUser> instance, against the shared pool
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

Adding a third entity is one new folder plus one line in `server.ts` plus its table in `docker/init.sql` — nothing in `rest/` changes.
