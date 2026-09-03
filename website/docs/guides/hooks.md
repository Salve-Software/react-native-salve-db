---
title: Hooks
---

Three hooks cover the foreground reactive surface: `useQuery` for a single live
result set, `useInfiniteQuery` for paginated reads, and `useDatabaseReady` for
gating rendering on `SalveDbProvider`'s boot state. All three are cache-backed
and re-run automatically on any write to the table involved — regardless of
whether the write came from this hook, another screen, raw SQL, a migration,
or the native sync engine.

## `useQuery`

```ts
function useQuery<TSchema extends AnySchema>(props: {
  schema: TSchema;
  queryFn: (q: SelectQueryBuilder<TSchema>) => SelectQueryBuilder<TSchema>;
  deps?: readonly JsonValue[];
}): {
  data: InferSelectModel<TSchema>[] | null;
  isLoading: boolean;
  error: unknown;
};
```

- `schema` — the schema to read from and to subscribe to. Any `INSERT`/`UPDATE`/`DELETE`
  against this table re-runs `queryFn` and re-renders.
- `queryFn` — receives a `select` query builder already scoped to `schema`; apply
  `where`/`orderBy`/`limit`/`offset` here. See the [Query Builder](../guides/query-builder.md) guide.
- `deps` — extra reactive inputs (JSON-serializable) beyond `schema`, e.g. a search term.
  Changing `deps` re-runs the query the same way a table write does.

`data` is `null` until the first result lands; `isLoading` is `true` while
`SalveDbProvider` is still booting (`useDatabaseReady`) or while this specific
query hasn't produced a result yet; `error` surfaces either a provider boot
error or a query execution error.

If `schema.sync.enabled` is `true`, mounting the hook also triggers a
**throttled, read-triggered sync**: reading a synced table nudges
`Database.sync(schema.name)` in the background instead of requiring you to
call it yourself. See [Sync](./sync.md) for the underlying push/pull contract.

```tsx
import { useQuery } from '@salve-software/react-native-salve-db';
import { eq } from '@salve-software/react-native-salve-db';
import { UserSchema } from './schemas/UserSchema';

function UserList({ search }: { search: string }) {
  const { data, isLoading, error } = useQuery({
    schema: UserSchema,
    queryFn: (q) => q.where(eq('name', search)).orderBy('updatedAt', 'desc').limit(50),
    deps: [search],
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorBanner error={error} />;

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(user) => String(user.id)}
      renderItem={({ item }) => <UserRow user={item} />}
    />
  );
}
```

Because `data` reflects every write to `users` from any source, editing a row
from [Studio](../studio.md), applying a sync pull, or writing from another
screen all re-render this list without any manual invalidation.

## `useInfiniteQuery`

```ts
function useInfiniteQuery<TSchema extends AnySchema>(props: {
  schema: TSchema;
  queryFn: (q: SelectQueryBuilder<TSchema>) => SelectQueryBuilder<TSchema>;
  pageSize: number;
  deps?: readonly JsonValue[];
}): {
  data: Row<TSchema>[] | null;
  isLoading: boolean;
  error: unknown;
  hasNextPage: boolean;
  fetchNextPage: () => void;
};
```

Same live-table semantics as `useQuery`, plus pagination:

- `queryFn` sets `where`/`orderBy` only — do not call `.limit()`/`.offset()`
  yourself, the hook manages paging and forwards `pageSize` internally.
- `fetchNextPage()` loads the next page and appends it to `data` (a no-op once
  `hasNextPage` is `false`).
- `data` is every loaded page flattened into a single array, in fetch order.

**Any write to `schema`'s table resets pagination back to page 0** and
refetches from the start — this hook is not a scroll-preserving "insert at
the top" feed. A background sync pull landing mid-scroll, or another screen
inserting a row, collapses accumulated pages and starts over, trading scroll
position for guaranteed on-disk consistency.

```tsx
import { useInfiniteQuery } from '@salve-software/react-native-salve-db';
import { TaskSchema } from './schemas/TaskSchema';

function TaskFeed() {
  const { data, isLoading, hasNextPage, fetchNextPage } = useInfiniteQuery({
    schema: TaskSchema,
    queryFn: (q) => q.orderBy('createdAt', 'desc'),
    pageSize: 20,
  });

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(task) => String(task.id)}
      renderItem={({ item }) => <TaskRow task={item} />}
      onEndReached={() => hasNextPage && fetchNextPage()}
      refreshing={isLoading}
    />
  );
}
```

## `useDatabaseReady`

```ts
function useDatabaseReady(): {
  isReady: boolean;
  isLoading: boolean;
  error: unknown;
};
```

Reads the readiness state set by the nearest `SalveDbProvider` ancestor.
`SalveDbProvider` runs `Database.configure(config)` then `Database.register(schema)`
for every schema in `schemas` on mount, and sets:

- `{ isReady: false, isLoading: true, error: null }` while configure/register are running,
- `{ isReady: true, isLoading: false, error: null }` once every schema has registered successfully,
- `{ isReady: false, isLoading: false, error }` if configure or any register call throws.

`useQuery` and `useInfiniteQuery` already call this internally and fold its
state into their own `isLoading`/`error` — you only need `useDatabaseReady`
directly when gating something outside a query, such as the app shell itself.

```tsx
import { useDatabaseReady } from '@salve-software/react-native-salve-db';

function AppShell({ children }: { children: React.ReactNode }) {
  const { isReady, isLoading, error } = useDatabaseReady();

  if (error) return <BootErrorScreen error={error} />;
  if (isLoading || !isReady) return <SplashScreen />;

  return <>{children}</>;
}
```
