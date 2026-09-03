---
title: Schemas
---

A schema is a plain object describing one local SQLite table: its name, version, primary key,
columns, indexes, relations, and (optionally) its sync contract. Schemas are declarative data, not
classes or functions — both the query builder and the native migration/sync engines read them
directly.

## `ISchemaDefinition<TEntity>`

```ts
interface ISchemaDefinition<TEntity> {
  name: string;
  version: number;
  primaryKey: keyof TEntity;
  columns: Record<string, IColumnDefinition>;
  indexes?: IIndexDefinition[];
  relations?: IRelationDefinition<TEntity>[];
  sync?: ISyncDefinition;
}
```

- **`name`** — unique table name, e.g. `"users"`.
- **`version`** — bumped whenever `columns` changes; drives auto-migrations (see below).
- **`primaryKey`** — must be a key of `TEntity`. Required on every insert — the MVP has no native
  autoincrement, so the app is responsible for generating ids (e.g. a client-side UUID).
- **`columns`** — a map of column name to [`IColumnDefinition`](#icolumndefinition).
- **`indexes`** — optional list of [`IIndexDefinition`](#iindexdefinition). Required for any column
  used in `where()`/`orderBy()` beyond the primary key — see
  [Query Builder](../guides/query-builder.md#the-indexed-column-rule).
- **`relations`** — optional foreign-key links to parent schemas, see
  [`IRelationDefinition`](#irelationdefinition).
- **`sync`** — optional `ISyncDefinition`. Omit it entirely for local-only tables.

## `IColumnDefinition`

```ts
interface IColumnDefinition {
  type: "text" | "integer" | "real" | "boolean" | "blob" | "datetime";
  nullable?: boolean;
  unique?: boolean;
  default?: unknown;
}
```

- **`type`** — the SQLite storage type. `datetime` is stored and inferred as `number` (epoch
  millis) — not a `Date` and not a string — so there is no timezone ambiguity anywhere in the
  project (query params, sync payloads, conflict comparisons all use the same epoch-millis
  convention).
- **`nullable`** — when `true`, the column accepts `NULL` and becomes optional in the inferred
  insert model.
- **`unique`** — adds a `UNIQUE` constraint on the column.
- **`default`** — a default value. A column with a `default` (and not `nullable`) is also optional
  on insert; a column with neither is required.

TS type inference (`InferSelectModel`/`InferInsertModel`, from
[Query Builder](../guides/query-builder.md)) maps `type` to:

| `IColumnDefinition.type` | TS type |
|---|---|
| `text` | `string` |
| `integer` | `number` |
| `real` | `number` |
| `boolean` | `boolean` (SQLite stores `0`/`1`; coercion happens natively) |
| `blob` | `Uint8Array` |
| `datetime` | `number` (epoch millis) |

## `IIndexDefinition`

```ts
interface IIndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
}
```

- **`name`** — unique index name, e.g. `"idx_users_email"`.
- **`columns`** — columns covered by the index, **in declaration order**. Order matters: the query
  builder's indexed-column rule only recognizes the *first* column of the array as covered — see
  [Query Builder](../guides/query-builder.md#the-indexed-column-rule).
- **`unique`** — adds a `UNIQUE` constraint to the index.

## `IRelationDefinition`

```ts
interface IRelationDefinition<TEntity> {
  column: keyof TEntity;
  references: string;
}
```

A foreign-key link from this schema's `column` to a parent schema named `references`. Declared on
the child schema; there is no reverse/`hasMany` declaration.

## The injected `deletedAt` column and soft deletes

Every schema gets a `deletedAt: { type: 'datetime', nullable: true }` column injected
automatically when it's registered — **do not declare a column literally named `deletedAt`
yourself**; doing so throws at registration time (`"'deletedAt' is a reserved column managed by
SalveDb"`).

This backs soft deletes end to end:

- `Database.delete(...).execute()` never issues a SQL `DELETE`. It runs
  `UPDATE <table> SET deletedAt = ? [WHERE ...]`, stamping the current epoch-millis timestamp.
- Every `select`/`count` (and `update`/`delete` targeting) automatically ANDs `"deletedAt" IS NULL`
  onto its `WHERE` clause — soft-deleted rows are invisible to the query builder without any extra
  filtering from the caller.
- On the sync side, a non-null `deletedAt` is how a pulled row is recognized as a tombstone (see
  the REST sync contract for details).

## The `satisfies` pattern

Always declare a schema with `satisfies ISchemaDefinition<TEntity>`, never a `: ISchemaDefinition<TEntity>`
type annotation:

```ts
import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

export interface User {
  id: number;
  name: string;
  email: string;
  updatedAt: number;
}

export const UserSchema = {
  name: 'users',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    name: { type: 'text' },
    email: { type: 'text' },
    updatedAt: { type: 'datetime', nullable: false },
  },
  indexes: [
    { name: 'idx_users_updated_at', columns: ['updatedAt'] },
    { name: 'idx_users_email', columns: ['email'] },
  ],
  sync: {
    enabled: true,
    direction: 'bidirectional',
    conflict: 'lastWriteWins',
    transport: 'rest',
    endpoint: { basePath: '/users', listQueryTemplate: 'updatedAfter={since}&limit={limit}' },
    pagination: { pageSize: 50, maxPagesPerSession: 20 },
  },
} satisfies ISchemaDefinition<User>;
```

`satisfies` type-checks `UserSchema` against `ISchemaDefinition<User>` **without widening its
inferred type** — `UserSchema.columns` keeps its precise literal shape (each column's exact `type`
literal, whether `nullable`/`default` are present at all). `InferSelectModel<TSchema>` and
`InferInsertModel<TSchema>` (used throughout the [Query Builder](../guides/query-builder.md)) are
mapped types that walk `TSchema["columns"]` key by key, branching on those literal `type`/
`nullable`/`default` values.

A `: ISchemaDefinition<User>` annotation instead widens `UserSchema` to the interface's own type —
`columns` collapses to the general `Record<string, IColumnDefinition>`, discarding every per-column
literal. `InferSelectModel`/`InferInsertModel` then have nothing precise to map over: every column
resolves to the same generic union instead of its real type, and required-vs-optional insert
fields can no longer be distinguished. `select`/`insert`/`update` calls against that schema lose
column-level type safety even though the schema itself still type-checks.

## Auto-migrations

`Database.register({ schema })`:

- Creates the table on first run.
- On every subsequent app start, compares the registered `schema.version` against the version last
  persisted for that table. If it increased, applies pending migrations — **`ADD COLUMN` only**.
  Columns present in the new schema but missing from the live table are added; there is no `DROP`
  or `RENAME` support, and no migration files to author by hand.

This means schema evolution is intentionally one-directional and additive: renaming or removing a
column requires introducing a new column and migrating data at the application level, not editing
the SQLite table shape directly. `register` also validates the schema shape up front — `name`,
`version` (a number), and `primaryKey` are all required, or `register` throws immediately.

For the full migration mechanics, version-bump walkthrough, and what happens across app restarts,
see [Migrations](../guides/migrations.md).
