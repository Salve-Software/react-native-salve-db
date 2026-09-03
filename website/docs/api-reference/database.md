---
title: Database
---

Static-only facade over the native SQLite core (`src/database/Database.class.ts`). Every method
delegates to the same underlying native connection — there is no instance to construct, and no
`new Database()`.

```ts
import { Database } from '@salve-software/react-native-salve-db';
```

## Configuration

### `Database.configure(props: IConfigureProps): void`

Opens (or creates) the local database file and sets sync/auth config. Must be called once, before
`register`, `select`/`insert`/`update`/`delete`, or `execute`.

```ts
interface IConfigureProps {
  name: string;
  baseUrl?: string;
  network?: { timeout: number };
  credentials?: ICredentialsDefinition; // OAuth2 only in the MVP
  walMode?: boolean;       // default true
  syncOnAppOpen?: boolean; // default true
  background?: {
    minimumInterval: number;
    requiresNetwork?: boolean;
    requiresCharging?: boolean;
  };
}
```

```ts
Database.configure({
  name: 'my-app.db',
  baseUrl: 'https://api.example.com',
  credentials: {
    provider: 'oauth2',
    tokens: { accessToken, refreshToken },
    refresh: {
      endpoint: '/auth/refresh',
      response: { accessToken: '$.access_token', refreshToken: '$.refresh_token' },
    },
  },
  background: { minimumInterval: 15 * 60 * 1000, requiresNetwork: true },
});
```

### `Database.register(props: IRegisterProps): Promise<void>`

Registers a schema: creates its table on first run, or applies pending `ADD COLUMN` migrations if
`schema.version` increased since the last run. Requires `configure` to have run first. Throws if
`schema.name`, `schema.version`, or `schema.primaryKey` is missing, or if `primaryKey` isn't a key
in `schema.columns`.

```ts
interface IRegisterProps {
  schema: AnySchema;
}
```

```ts
await Database.register({ schema: UserSchema });
```

### `Database.reset(): Promise<void>`

Wipes all local data and credentials — a full sign-out. Clears the in-memory current user (see
`setCurrentUser` below) before the native wipe, regardless of whether it succeeds. `register()` per
schema resumes local use afterwards; `configure()` again is only needed to restore sync.

```ts
await Database.reset();
```

### `Database.logout(): void`

Clears only the stored credential tokens; local data, schemas, and config are untouched. Use for a
normal sign-out. Clears the current user before the native call, regardless of whether it succeeds.

```ts
Database.logout();
```

### `Database.setCurrentUser(id: string): void`

Registers the id of the currently logged-in user, resolved by the package-level `currentUser()`
helper (see [Operators & Types](./operators-types.md)) inside `.where()`/`.values()`. Call again on
every cold start once the app's own session is rehydrated — this state is in-memory only, not
persisted by this library. Throws if `id` is empty or blank.

```ts
Database.setCurrentUser('user-123');
```

### `Database.getCurrentUser(): string | null`

Non-throwing read of the current user id, or `null` if none is set.

```ts
const userId = Database.getCurrentUser();
```

## Queries

Every query method returns a builder scoped to `schema`; nothing runs until you call `.execute()`.
See [Query Builder](../guides/query-builder.md) for the full narrative and
[Operators & Types](./operators-types.md) for `where()` condition operators and inferred row types.

### `Database.select<TSchema>(schema: TSchema): ISelectQueryBuilder<TSchema>`

Starts a `SELECT` against `schema`'s table.

```ts
interface ISelectQueryBuilder<TSchema> {
  where(condition: Condition): this;
  orderBy(column: keyof InferSelectModel<TSchema>, direction?: 'asc' | 'desc'): this;
  limit(n: number): this;
  offset(n: number): this;
  execute(): InferSelectModel<TSchema>[];
}
```

`execute()` defaults `limit` to `MAX_SYNC_PAGE_SIZE` (500) when omitted, and throws if `limit`
exceeds it. Every column referenced in `where()`/`orderBy()` must be the leading column of a
declared index (or the primary key) — see the
[FAQ](../faq-troubleshooting.md#why-does-my-query-throw-about-a-missing-index).

```ts
const rows = Database.select(UserSchema)
  .where(eq('id', currentUser()))
  .orderBy('createdAt', 'desc')
  .limit(20)
  .execute();
```

### `Database.insert<TSchema>(schema: TSchema): IInsertQueryBuilder<TSchema>`

Starts an `INSERT` into `schema`'s table.

```ts
interface IInsertQueryBuilder<TSchema> {
  values(row: InferInsertModel<TSchema> | InferInsertModel<TSchema>[]): this;
  /** Upsert: on primary-key conflict, overwrites every other inserted column with `excluded.col`. */
  onConflictDoUpdate(): this;
  execute(): void;
}
```

A batch larger than `MAX_BATCH_INSERT_ROWS` (500 rows) throws — see the
[FAQ](../faq-troubleshooting.md#whats-the-max-rows-i-can-insertselect-at-once).

```ts
Database.insert(UserSchema)
  .values({ id: '1', name: 'Ada', createdAt: Date.now() })
  .execute();

Database.insert(UserSchema)
  .values(rows)
  .onConflictDoUpdate()
  .execute();
```

### `Database.update<TSchema>(schema: TSchema): IUpdateQueryBuilder<TSchema>`

Starts an `UPDATE` on `schema`'s table.

```ts
interface IUpdateQueryBuilder<TSchema> {
  set(patch: Partial<InferInsertModel<TSchema>>): this;
  where(condition: Condition): this;
  execute(): void;
}
```

```ts
Database.update(UserSchema)
  .set({ name: 'Ada Lovelace' })
  .where(eq('id', '1'))
  .execute();
```

### `Database.delete<TSchema>(schema: TSchema): IDeleteQueryBuilder<TSchema>`

Starts a `DELETE` from `schema`'s table.

```ts
interface IDeleteQueryBuilder<TSchema> {
  where(condition: Condition): this;
  execute(): void;
}
```

```ts
Database.delete(UserSchema).where(eq('id', '1')).execute();
```

### `Database.count<TSchema>(schema: TSchema): ICountQueryBuilder<TSchema>`

Starts a `COUNT(*)` against `schema`'s table.

```ts
interface ICountQueryBuilder<TSchema> {
  where(condition: Condition): this;
  execute(): number;
}
```

```ts
const total = Database.count(UserSchema).where(eq('active', true)).execute();
```

### `Database.transaction<T>(fn: (tx: IQueryClient) => T): T`

Runs `fn` inside a native `BEGIN`/`COMMIT` transaction, rolling back if `fn` throws. `tx` exposes
the same `select`/`insert`/`update`/`delete`/`count`/`execute`/`transaction` surface as `Database`
itself, scoped to that transaction.

```ts
interface IQueryClient {
  select<TSchema>(schema: TSchema): ISelectQueryBuilder<TSchema>;
  insert<TSchema>(schema: TSchema): IInsertQueryBuilder<TSchema>;
  update<TSchema>(schema: TSchema): IUpdateQueryBuilder<TSchema>;
  delete<TSchema>(schema: TSchema): IDeleteQueryBuilder<TSchema>;
  count<TSchema>(schema: TSchema): ICountQueryBuilder<TSchema>;
  transaction<T>(fn: (tx: IQueryClient) => T): T;
  execute(sql: string, params?: unknown[]): unknown[];
}
```

Every write inside `tx` still fires triggers normally — the sync queue is populated on `COMMIT`,
not on each isolated write.

```ts
Database.transaction((tx) => {
  tx.insert(OrderSchema).values(order).execute();
  tx.update(UserSchema).set({ orderCount: count + 1 }).where(eq('id', userId)).execute();
});
```

### `Database.execute(sql: string, params?: unknown[]): unknown[]`

Escape hatch: runs raw parametrized SQL and returns the resulting rows as plain objects. No type
safety or inference, but because triggers are defined at the SQLite table level, raw SQL is still
tracked by `sync_queue` normally.

```ts
const rows = Database.execute('SELECT * FROM users WHERE id = ?', ['1']);
```

## Change subscriptions

### `Database.subscribeToChanges(callback: (tables: string[]) => void): number`

Subscribes to table-level write notifications (insert/update/delete — from any source: query
builder, raw SQL, migrations, or background sync). Returns a subscription id, pass to
`unsubscribeFromChanges` to stop listening. `useQuery`/`useInfiniteQuery` use this internally — see
[Hooks](./hooks.md) — prefer the hooks unless you need a manual, non-React subscription.

```ts
const subId = Database.subscribeToChanges((tables) => {
  if (tables.includes('users')) refreshUserList();
});
```

### `Database.unsubscribeFromChanges(id: number): void`

Stops a subscription previously created by `subscribeToChanges`.

```ts
Database.unsubscribeFromChanges(subId);
```

## Sync

See [Sync](../guides/sync.md) for the full push/pull contract and conflict resolution.

### `Database.sync(schemaName: string): Promise<NativeSyncResult>`

Triggers a sync session for a single schema.

```ts
await Database.sync('users');
```

### `Database.syncAll(): Promise<NativeSyncResult[]>`

Triggers a sync session for every schema registered with `sync.enabled`.

```ts
await Database.syncAll();
```
