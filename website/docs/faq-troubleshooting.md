---
title: FAQ & Troubleshooting
---

## Why does my query throw about a missing index?

`select()`, `update()`, `delete()`, and `count()` all run `assertIndexedColumns()` before executing:
every column referenced in `.where()` (and, for `select()`, `.orderBy()`) must be either the
schema's `primaryKey` or the **leading column** of a declared `indexes` entry. This is enforced
synchronously, at call time — not a lint warning.

```ts
// throws: "Synchronous execute() requires an index covering column \"email\" as its
// leading column (schema \"users\"). Declare it in schema.indexes, or remove it from
// where()/orderBy()."
Database.select(UserSchema).where(eq('email', 'a@b.com')).execute();
```

Fix by adding an index whose first column is the one you filter/sort by:

```ts
indexes: [{ name: 'idx_users_email', columns: ['email'] }],
```

A composite index only satisfies the rule for its **first** column — `columns: ['a', 'b']` covers
queries filtering on `a`, not queries filtering on `b` alone. See
[Schemas](./guides/schemas.md) for how to declare indexes.

## Why did my `currentUser()` call throw?

`currentUser()` throws `"currentUser(): no user set — call Database.setCurrentUser() first"` if no
user id has been registered yet. It deliberately fails loud instead of returning `null` — a `null`
would silently compile to `WHERE col = NULL`, matching zero rows without ever explaining why.

Two common causes:

1. **`Database.setCurrentUser(id)` was never called.** Call it right after your app's own login
   flow resolves the user id.
2. **The app cold-started and `setCurrentUser` wasn't called again.** The current-user id lives in
   memory only — it is *not* persisted across app restarts (unlike credential tokens, which are
   stored in Keychain/Keystore). Call `Database.setCurrentUser(id)` again once your app's own
   session/auth state has rehydrated, before any code path that calls `currentUser()`.

`Database.getCurrentUser()` is the non-throwing counterpart — returns the id or `null` — useful for
gating UI without triggering the throw. See [Operators & Types](./api-reference/operators-types.md#current-user).

## Background sync never fires on iOS

Background sync (`BGTaskScheduler`) requires explicit entitlements in the host app — Salve DB
cannot register them for you, and **the native scheduler does not throw or log a runtime error if
they're missing; the job simply never gets scheduled.** Check both:

**`Info.plist`** — the task identifier used internally, plus the `processing` background mode:

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>com.salvedb.background.sync</string>
</array>
<key>UIBackgroundModes</key>
<array>
  <string>processing</string>
</array>
```

**`*.entitlements`** — the Keychain access group used by the credential provider (needed for
background token refresh):

```xml
<key>keychain-access-groups</key>
<array>
  <string>$(AppIdentifierPrefix)com.yourapp</string>
</array>
```

Also confirm `Database.configure({ background: { minimumInterval, ... } })` was actually passed —
omitting `background` leaves the job disabled entirely, again silently. `minimumInterval` on iOS is
only an `earliestBeginDate` hint; `BGTaskScheduler` (not this library) decides the actual wake time,
so an occasional multi-hour delay in the simulator/device is expected behavior, not a bug.

## What's the max rows I can insert/select at once?

**Insert:** `Database.insert(schema).values(rows).execute()` throws if `rows.length` exceeds
`MAX_BATCH_INSERT_ROWS` (500) — enforced in `InsertQueryBuilder.execute()` before any SQL runs:

```
InsertQueryBuilder: 501 rows exceeds MAX_BATCH_INSERT_ROWS (500). Split into smaller
batches, wrapped in Database.transaction() if they must be atomic.
```

Split larger batches into chunks of ≤500, wrapping them in `Database.transaction()` if they need to
commit atomically as a group.

**Select:** `.limit(n)` on a select builder defaults to `MAX_SYNC_PAGE_SIZE` (500) when omitted, and
`execute()` throws if `n` exceeds it:

```
execute() limit (600) exceeds MAX_SYNC_PAGE_SIZE (500).
```

For more than 500 rows, page through results with `.limit()`/`.offset()`, or use
[`useInfiniteQuery`](./api-reference/hooks.md#useinfinitequery), which manages paging for you.

## Can I use `DROP`/`RENAME` in migrations?

No. `Database.register()` only ever runs `ADD COLUMN` when a schema's `version` increases — there
is no migration file to write and no way to drop or rename a column or table through this library.
Renaming a column means adding a new column and migrating data yourself (e.g. in application code,
or a one-off `Database.execute()` raw-SQL pass); the old column stays in the table until you handle
it explicitly. See [Schemas](./guides/schemas.md) for how `version` and `columns` drive migrations.
