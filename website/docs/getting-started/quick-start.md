---
title: Quick Start
sidebar_label: Quick Start
---

This walks through the minimum needed to define a schema, mount the provider, and run queries. Each
step links to a deeper guide — this page stays runnable end to end without repeating them.

## 1. Define a schema

```ts
import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

export interface User {
  id: number;
  name: string;
  email: string;
  updatedAt: number;
}

// `satisfies`, never `: ISchemaDefinition<User>` — a type annotation widens
// `columns` and breaks InferSelectModel/InferInsertModel.
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
} satisfies ISchemaDefinition<User>;
```

`satisfies` checks `UserSchema` against `ISchemaDefinition<User>` without changing its inferred type —
a `: ISchemaDefinition<User>` annotation would widen `columns` to the declared type and silently break
`InferSelectModel`/`InferInsertModel`, which rely on the narrower, literal shape TypeScript infers when
you use `satisfies`.

Sync is omitted here for brevity — see [Schemas](../guides/schemas.md) for indexes, relations, and the
full sync contract.

## 2. Wrap your app in `SalveDbProvider`

```tsx
import { SalveDbProvider } from '@salve-software/react-native-salve-db';
import { UserSchema } from './schemas/UserSchema';

export default function App() {
  return (
    <SalveDbProvider
      config={{ name: 'my-app-db' }}
      schemas={[UserSchema]}
    >
      <YourApp />
    </SalveDbProvider>
  );
}
```

`SalveDbProvider` runs `Database.configure` + `Database.register` for you and exposes
`{ isReady, isLoading, error }`. Add `baseUrl`, `credentials`, and `background` once you enable sync —
see [Sync](../guides/sync.md).

## 3. Query and mutate

```ts
import { Database, eq, and, like } from '@salve-software/react-native-salve-db';

// select — .limit() is mandatory, capped at 500
const users = Database.select(UserSchema)
  .where(and(eq('id', 1), like('email', '%@company.com')))
  .orderBy('updatedAt', 'desc')
  .limit(50)
  .execute();

Database.insert(UserSchema).values({ id: 2, name: 'Ada', email: 'ada@co.com', updatedAt: Date.now() }).execute();
Database.update(UserSchema).set({ name: 'Ada Lovelace' }).where(eq('id', 2)).execute();
Database.delete(UserSchema).where(eq('id', 2)).execute(); // soft delete
Database.count(UserSchema).execute();

Database.transaction((tx) => {
  tx.insert(UserSchema).values({ id: 3, name: 'Grace', email: 'grace@co.com', updatedAt: Date.now() }).execute();
  tx.update(UserSchema).set({ name: 'Grace Hopper' }).where(eq('id', 3)).execute();
});
```

Every column used in `where()`/`orderBy()` must be the leading column of a declared index (or the
primary key) — see the query builder guide for why and how to work around it. Full builder API,
operators, and the `MAX_BATCH_INSERT_ROWS` batch-insert cap: [Query Builder](../guides/query-builder.md).

## 4. Subscribe with `useQuery`

```tsx
import { useQuery } from '@salve-software/react-native-salve-db';
import { eq } from '@salve-software/react-native-salve-db';
import { UserSchema } from './schemas/UserSchema';

function UserList({ search }: { search: string }) {
  const { data, isLoading, error } = useQuery({
    schema: UserSchema,
    // queryFn receives a `select` builder already scoped to UserSchema — apply
    // where/orderBy/limit/offset directly on it, don't call `.select()` again.
    queryFn: (q) => q.where(eq('name', search)).orderBy('updatedAt', 'desc').limit(50),
    deps: [search],
  });

  // re-runs automatically on any write to `users`, from any source —
  // your own code, raw SQL, a migration, or the background sync engine
  return null;
}
```

For `useInfiniteQuery`, `useDatabaseReady`, and the throttled read-triggered sync behavior, see
[Hooks](../guides/hooks.md).

## What's next

- [Schemas](../guides/schemas.md) — columns, indexes, relations, sync contracts
- [Query Builder](../guides/query-builder.md) — full builder API and the indexed-column rule
- [Hooks](../guides/hooks.md) — `useQuery`, `useInfiniteQuery`, `useDatabaseReady`
- [Sync](../guides/sync.md) — enabling sync, credentials, background scheduling, conflict resolution
