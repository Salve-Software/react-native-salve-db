---
title: Hooks
---

Reference for the three React hooks exported from `@salve-software/react-native-salve-db`. For the
narrative explanation — why they exist, how live re-rendering works, and how sync interacts with
them — see [Hooks](../guides/hooks.md). This page is signature-first.

```ts
import { useQuery, useInfiniteQuery, useDatabaseReady } from '@salve-software/react-native-salve-db';
```

## `useQuery`

```ts
function useQuery<TSchema extends AnySchema>(
  props: IUseQueryProps<TSchema>
): IUseQueryResult<InferSelectModel<TSchema>>;

interface IUseQueryProps<TSchema> {
  schema: TSchema;
  queryFn: (q: SelectQueryBuilder<TSchema>) => SelectQueryBuilder<TSchema>;
  deps?: readonly JsonValue[];
}

interface IUseQueryResult<TRow> {
  data: TRow[] | null;
  error: unknown;
  isLoading: boolean;
}
```

Runs a `select` against `schema`, cached and kept live: it automatically re-runs and re-renders
whenever a write touches `schema`'s table, no matter the source (this hook, another screen, raw
SQL, or native background sync). Requires [`useDatabaseReady`](#usedatabaseready) internally —
`data` stays `null` and `isLoading` stays `true` until the database has finished `configure`/
`register`. If `schema.sync?.enabled` is `true`, mounting also requests a read sync for that
schema.

`deps` is compared with a stable structural stringify — pass any primitive/array/object values
your `queryFn` closure depends on (e.g. a filter value), the same way you would a `useEffect` deps
array.

```ts
const { data, isLoading, error } = useQuery({
  schema: UserSchema,
  queryFn: (q) => q.where(eq('active', true)).orderBy('createdAt', 'desc'),
  deps: [],
});
```

## `useInfiniteQuery`

```ts
function useInfiniteQuery<TSchema extends AnySchema>(
  props: IUseInfiniteQueryProps<TSchema>
): IUseInfiniteQueryResult<Row<TSchema>>;

interface IUseInfiniteQueryProps<TSchema> {
  schema: TSchema;
  /** Apply where()/orderBy() here — do not call limit()/offset(), the hook manages paging. */
  queryFn: (q: SelectQueryBuilder<TSchema>) => SelectQueryBuilder<TSchema>;
  /** Rows fetched per page, forwarded to .limit() (subject to MAX_SYNC_PAGE_SIZE). */
  pageSize: number;
  deps?: readonly JsonValue[];
}

interface IUseInfiniteQueryResult<TRow> {
  /** All loaded pages flattened into a single array, in fetch order. */
  data: TRow[] | null;
  error: unknown;
  /** True until the first page has loaded. */
  isLoading: boolean;
  hasNextPage: boolean;
  /** No-op if hasNextPage is false. */
  fetchNextPage: () => void;
}
```

Paginated variant of `useQuery`: loads `pageSize` rows at a time via `fetchNextPage()`,
accumulating pages into `data`. `pageSize` must be a positive integer or the hook throws. Kept live
the same way `useQuery` is — any write to `schema`'s table (from any source) resets back to page 0
and refetches, so pagination state never drifts from what's on disk. Not meant for
scroll-preserving "insert at the top" feeds — a write always restarts from page 0.

```ts
const { data, hasNextPage, fetchNextPage, isLoading } = useInfiniteQuery({
  schema: UserSchema,
  queryFn: (q) => q.orderBy('createdAt', 'desc'),
  pageSize: 20,
});
```

## `useDatabaseReady`

```ts
function useDatabaseReady(): IDatabaseReadyState;

interface IDatabaseReadyState {
  isReady: boolean;
  isLoading: boolean;
  error: unknown;
}
```

Reads the database readiness state set by the nearest `SalveDbProvider` ancestor. Used to gate
screens/queries until `configure`/`register` have finished, and to surface a boot-time failure
without crashing. `useQuery` and `useInfiniteQuery` already call this internally — use it directly
only for screen-level gating outside those hooks.

```ts
const { isReady, isLoading, error } = useDatabaseReady();
if (!isReady) return <SplashScreen loading={isLoading} error={error} />;
```
