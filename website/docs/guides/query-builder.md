---
title: Query Builder
---

`Database` exposes a static, Drizzle-style query builder over each registered schema. JS builds a
parametrized SQL string; the native core executes it and returns plain rows. Every builder method
listed below is fully typed from the schema via `InferSelectModel`/`InferInsertModel` — see
[Schemas](../guides/schemas.md).

All query execution (`select`/`insert`/`update`/`delete`/`count`/`transaction`) is **synchronous**
— it runs directly on the JS thread, not as a `Promise`. That's why the guardrails below (mandatory
`.limit()`, the indexed-column rule) exist: a sync call on the JS thread must have a bounded,
predictable cost.

## `Database` static API

```ts
Database.select<TSchema>(schema: TSchema): ISelectQueryBuilder<TSchema>;
Database.insert<TSchema>(schema: TSchema): IInsertQueryBuilder<TSchema>;
Database.update<TSchema>(schema: TSchema): IUpdateQueryBuilder<TSchema>;
Database.delete<TSchema>(schema: TSchema): IDeleteQueryBuilder<TSchema>;
Database.count<TSchema>(schema: TSchema): ICountQueryBuilder<TSchema>;
Database.transaction<T>(fn: (tx: IQueryClient) => T): T;
Database.execute(sql: string, params?: unknown[]): unknown[];
```

- **`select`/`insert`/`update`/`delete`/`count`** each return a chainable builder scoped to
  `schema`'s table. Nothing runs until `.execute()` is called.
- **`transaction`** runs `fn` inside a native `BEGIN`/`COMMIT`, rolling back on any thrown error.
  `fn` receives a `tx: IQueryClient` exposing the same `select`/`insert`/`update`/`delete`/`count`/
  `transaction`/`execute` surface — use `tx`, not `Database`, for every call inside the callback.
  Every write inside `tx` still fires its table trigger normally (so reads inside the same
  transaction see uncommitted writes); the sync queue is only populated once, on `COMMIT`, not on
  each isolated write.
- **`execute`** is the raw-SQL escape hatch, covered [below](#raw-sql-escape-hatch).

```ts
db.transaction((tx) => {
  tx.insert(OrderSchema).values({ id, customerId, total }).execute();
  tx.insert(OrderItemSchema).values({ orderId: id, sku, qty }).execute();
});
```

## Select

```ts
interface ISelectQueryBuilder<TSchema> {
  where(condition: Condition): this;
  orderBy(column: keyof InferSelectModel<TSchema>, direction?: "asc" | "desc"): this;
  limit(n: number): this;
  offset(n: number): this;
  execute(): InferSelectModel<TSchema>[];
}
```

```ts
const activeUsers = Database
  .select(UserSchema)
  .where(eq('active', true))
  .orderBy('updatedAt', 'desc')
  .limit(50)
  .execute();
```

Every `select` (and `count`) automatically excludes soft-deleted rows — the builder ANDs
`"deletedAt" IS NULL` onto the `WHERE` clause; see [Schemas](../guides/schemas.md#the-injected-deletedat-column-and-soft-deletes).

### The mandatory `.limit()` cap

`.limit()` is not required to be called explicitly, but `execute()` always applies one:

- If `.limit()` was never called, `execute()` defaults to `MAX_SYNC_PAGE_SIZE` (`500`).
- If `.limit()` was called, its value must be a non-negative integer and **must not exceed
  `MAX_SYNC_PAGE_SIZE` (500)** — a larger value throws at `execute()` time.

This single mechanism covers both "fetch one row by primary key" (`.limit(1)`) and "fetch one page
of N rows" with the same guardrail: because `execute()` runs synchronously on the JS thread, an
unbounded result set would block it for an unpredictable amount of time. `LIMIT` intentionally does
not apply to `update`/`delete` — SQLite has no native `LIMIT` on those statements, and "update/
delete everything matching the condition" is the expected behavior, not something to paginate.

Don't confuse this with `MAX_BATCH_INSERT_ROWS` (also `500`) — that constant caps `InsertQueryBuilder.values()`'s
row count instead, a separate guardrail covered under [Insert](#insert).

## The indexed-column rule

Every column passed to `.where()` or `.orderBy()` — on `select`, `count`, `update`, or `delete` —
must be either the schema's `primaryKey` or the **leading column** of some index declared in
`schema.indexes`. This is enforced by `assertIndexedColumns`, which runs before every synchronous
`execute()`:

```ts
const isIndexed = schema.indexes?.some((index) => index.columns[0] === column);
if (!isIndexed && column !== schema.primaryKey) {
  throw new Error(
    `Synchronous execute() requires an index covering column "${column}" as its leading column ` +
    `(schema "${schema.name}"). Declare it in schema.indexes, or remove it from where()/orderBy().`,
  );
}
```

`.limit()` alone bounds the *size of the result*, not the *cost of the scan* — a condition or
ordering on a column with no leading index still forces SQLite to scan the whole table before
`LIMIT` is applied (or, for `update`/`delete`, before it can find the rows to change). The rule
reuses `leftmost-prefix` matching against `IIndexDefinition.columns`: a column only counts as
indexed if it's the *first* entry of some index's `columns` array — declaring it second or third in
a composite index does not satisfy the rule, matching how SQLite actually uses composite indexes
for `WHERE`/`ORDER BY`.

`InsertQueryBuilder` and the raw `Database.execute(sql, params)` escape hatch have no index guard —
insert cost is already proportional to what the caller wrote explicitly, and raw SQL has no
associated schema to validate an index against.

## Insert

```ts
interface IInsertQueryBuilder<TSchema> {
  values(row: InferInsertModel<TSchema> | InferInsertModel<TSchema>[]): this;
  onConflictDoUpdate(): this;
  execute(): void;
}
```

```ts
// single row
Database.insert(UserSchema).values({ id, name, email, updatedAt: Date.now() }).execute();

// batch insert (single multi-row INSERT)
Database.insert(UserSchema).values(users).execute();

// upsert — e.g. applying a page pulled down from sync
Database.insert(UserSchema).values(user).onConflictDoUpdate().execute();
```

- **`values`** accepts one row or an array of rows (all with the same column set) and compiles them
  into a single multi-row `INSERT`.
- **`onConflictDoUpdate`** turns the insert into an upsert: on a primary-key conflict, every other
  inserted column is overwritten with the incoming value (`excluded.col`). Requires `values()` to
  have been called first.

Two size guards apply to a batch, both checked at `execute()` time:

- **`MAX_BATCH_INSERT_ROWS = 500`** — the row count passed to `values()` must not exceed this, or
  `execute()` throws `InsertQueryBuilder: N rows exceeds MAX_BATCH_INSERT_ROWS (500)`. Split larger
  batches into multiple calls, wrapped in `Database.transaction()` if they must be atomic.
- **`SQLITE_MAX_BOUND_PARAMS = 999`** — a second, independent check rejects the batch if
  `rows × columns` exceeds this — SQLite's own cap on bound parameters per statement in standard
  builds. A wide table can hit this well before hitting the 500-row cap (e.g. 500 rows × 3 columns
  = 1500 params already exceeds 999).

## Update

```ts
interface IUpdateQueryBuilder<TSchema> {
  set(patch: Partial<InferInsertModel<TSchema>>): this;
  where(condition: Condition): this;
  execute(): void;
}
```

```ts
Database.update(UserSchema)
  .set({ name: 'New Name', updatedAt: Date.now() })
  .where(eq('id', userId))
  .execute();
```

`where()` is optional but, when present, is subject to the same [indexed-column
rule](#the-indexed-column-rule) as `select`.

## Delete

```ts
interface IDeleteQueryBuilder<TSchema> {
  where(condition: Condition): this;
  execute(): void;
}
```

```ts
Database.delete(UserSchema).where(eq('id', userId)).execute();
```

`delete` never issues SQL `DELETE` — it soft-deletes by running `UPDATE <table> SET deletedAt = ?
[WHERE ...]`. A bare `Database.delete(UserSchema).execute()` (no `.where()`) soft-deletes every row
in the table. `where()`, when present, is subject to the [indexed-column rule](#the-indexed-column-rule).

## Count

```ts
interface ICountQueryBuilder<TSchema> {
  where(condition: Condition): this;
  execute(): number;
}
```

```ts
const pendingCount = Database.count(OrderSchema).where(eq('status', 'pending')).execute();
```

Like `select`, `count` automatically excludes soft-deleted rows. `where()`, when present, is
subject to the [indexed-column rule](#the-indexed-column-rule).

## Condition operators

All operators live in the package's top-level export and build an opaque `Condition` value
consumed by `where()`. Columns are plain string keys of the schema.

| Operator | Signature | Example |
|---|---|---|
| `eq` | `eq(column: string, value: SqlValue): Condition` | `eq('id', userId)` |
| `ne` | `ne(column: string, value: SqlValue): Condition` | `ne('status', 'archived')` |
| `gt` | `gt(column: string, value: SqlValue): Condition` | `gt('age', 18)` |
| `gte` | `gte(column: string, value: SqlValue): Condition` | `gte('updatedAt', since)` |
| `lt` | `lt(column: string, value: SqlValue): Condition` | `lt('retryCount', 3)` |
| `lte` | `lte(column: string, value: SqlValue): Condition` | `lte('price', 100)` |
| `like` | `like(column: string, pattern: string): Condition` | `like('name', '%acme%')` |
| `inArray` | `inArray(column: string, values: SqlValue[]): Condition` | `inArray('id', [1, 2, 3])` |
| `isNull` | `isNull(column: string): Condition` | `isNull('archivedAt')` |
| `isNotNull` | `isNotNull(column: string): Condition` | `isNotNull('email')` |
| `and` | `and(...conditions: Condition[]): Condition` | `and(eq('active', true), gt('age', 18))` |
| `or` | `or(...conditions: Condition[]): Condition` | `or(eq('status', 'new'), eq('status', 'pending'))` |
| `not` | `not(condition: Condition): Condition` | `not(eq('status', 'archived'))` |

```ts
Database.select(OrderSchema)
  .where(and(eq('customerId', customerId), or(eq('status', 'pending'), eq('status', 'processing'))))
  .orderBy('createdAt', 'desc')
  .limit(20)
  .execute();
```

## Raw SQL escape hatch

```ts
Database.execute(sql: string, params?: unknown[]): unknown[];
```

Runs raw, parametrized SQL against the same connection and returns the resulting rows as plain
objects. It has no type inference and no indexed-column guard (there's no schema to validate
against), but writes issued this way are still tracked normally — the sync trigger is defined at
the SQLite table level, not inside the query builder, so a raw `INSERT`/`UPDATE`/`DELETE` still
populates `sync_queue` like a builder-issued write.

```ts
const rows = Database.execute(
  'SELECT id, name FROM users WHERE deletedAt IS NULL AND email LIKE ?',
  ['%@example.com'],
);
```

Inside a `Database.transaction(fn)` callback, use `tx.execute(...)` instead — same signature,
scoped to the transaction.
