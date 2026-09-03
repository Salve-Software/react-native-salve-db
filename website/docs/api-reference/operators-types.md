---
title: Operators & Types
---

Reference for `where()`/`values()` condition operators, the current-user session helpers, and the
key inferred/declarative types. For the full conceptual walkthrough of schemas, columns, indexes,
and sync contracts, see [Schemas](../guides/schemas.md) and [Sync](../guides/sync.md).

```ts
import { eq, ne, gt, gte, lt, lte, like, inArray, isNull, isNotNull, and, or, not, currentUser } from '@salve-software/react-native-salve-db';
```

## Condition operators

Each operator returns an opaque `Condition`, passed to `.where()` on a select/update/delete/count
builder. Column names are plain strings, not typed against the schema.

```ts
const eq = (column: string, value: SqlValue): Condition;
const ne = (column: string, value: SqlValue): Condition;
const gt = (column: string, value: SqlValue): Condition;
const gte = (column: string, value: SqlValue): Condition;
const lt = (column: string, value: SqlValue): Condition;
const lte = (column: string, value: SqlValue): Condition;
const like = (column: string, pattern: string): Condition;
const inArray = (column: string, values: SqlValue[]): Condition;
const isNull = (column: string): Condition;
const isNotNull = (column: string): Condition;
const and = (...conditions: Condition[]): Condition;
const or = (...conditions: Condition[]): Condition;
const not = (condition: Condition): Condition;
```

```ts
Database.select(UserSchema)
  .where(and(eq('active', true), or(gt('score', 100), isNotNull('vipSince'))))
  .execute();

Database.select(UserSchema).where(like('name', 'Ada%')).execute();
Database.select(UserSchema).where(inArray('status', ['pending', 'active'])).execute();
Database.select(UserSchema).where(not(isNull('deletedAt'))).execute();
```

Every column referenced by `where()` (or `orderBy()`) must be the leading column of a declared
index, or the primary key — see the
[FAQ](../faq-troubleshooting.md#why-does-my-query-throw-about-a-missing-index).

## Current user

```ts
Database.setCurrentUser(id: string): void;  // see Database API reference
Database.getCurrentUser(): string | null;   // see Database API reference
function currentUser(): string;
```

`currentUser()` resolves to the id set by `Database.setCurrentUser()`, for use as a value inside
`.where()`/`.values()` (e.g. `eq('userId', currentUser())`). It is a value convenience, not a
security boundary: it does not enforce that any query actually filters by it. It throws if no user
has been set — see the
[FAQ](../faq-troubleshooting.md#why-did-my-currentuser-call-throw) — deliberately, instead of
resolving to `null` (which would silently compile to `WHERE col = NULL`, matching zero rows without
ever surfacing why).

```ts
Database.setCurrentUser('user-123');
Database.insert(OrderSchema).values({ id: '1', userId: currentUser(), total: 42 }).execute();
```

## Inferred row types

Both are derived from a schema's `columns` — see [Schemas](../guides/schemas.md) for how columns
are declared.

```ts
/** Row returned by select(); adds the reserved `deletedAt: number | null` column. */
type InferSelectModel<TSchema> = {
  [K in keyof TSchema['columns']]: ColumnTsType<TSchema['columns'][K]['type']>
    | (TSchema['columns'][K]['nullable'] extends true ? null : never);
} & { deletedAt: number | null };

/** Row accepted by insert()/update(). Nullable columns and columns with a `default` are optional. */
type InferInsertModel<TSchema> = {
  // required: columns that are neither nullable nor defaulted
} & {
  // optional: columns that are nullable or have a `default`
};
```

```ts
type User = InferSelectModel<typeof UserSchema>;
type NewUser = InferInsertModel<typeof UserSchema>;
```

## Declarative schema & sync types

Full field-by-field docs live in [Schemas](../guides/schemas.md) and [Sync](../guides/sync.md).
Quick reference:

- **`ISchemaDefinition<TEntity>`** — a local table: `name`, `version` (drives `ADD COLUMN`
  migrations on `register()`), `primaryKey`, `columns`, optional `indexes`, `relations`, and `sync`.
- **`IColumnDefinition`** — one column: `type` (`"text" | "integer" | "real" | "boolean" | "blob" |
  "datetime"`), optional `nullable`, `unique`, `default`.
- **`IIndexDefinition`** — `name`, `columns` (order matters — the leading column is what
  `where()`/`orderBy()` must match), optional `unique`.
- **`ISyncDefinition`** — a schema's REST sync contract: `enabled`, `direction` (`"bidirectional"`
  only in the MVP), `conflict` (`lastWriteWins` / `serverWins` / `clientWins`), `transport`
  (`"rest"` only), `endpoint`, optional `background`, optional `pagination`.

```ts
const UserSchema: ISchemaDefinition<User> = {
  name: 'users',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'text' },
    name: { type: 'text' },
    active: { type: 'boolean', default: true },
    createdAt: { type: 'datetime' },
  },
  indexes: [{ name: 'idx_users_active', columns: ['active'] }],
  sync: {
    enabled: true,
    direction: 'bidirectional',
    conflict: { strategy: 'lastWriteWins', field: 'updatedAt' },
    transport: 'rest',
    endpoint: { basePath: '/users', listQueryTemplate: 'updatedAfter={since}&limit={limit}', cursorField: 'updatedAt' },
  },
};
```
