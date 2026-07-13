import type { AnySchema } from '../../types';
import type { IUseInfiniteQueryProps, IUseInfiniteQueryResult } from './types';
import type { InferSelectModel } from '../../database/classes/QueryDb/classes/SelectQueryBuilder/types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Database } from '../../database';
import { queryCache } from '../../cache';
import { useDatabaseReady } from '../useDatabaseReady';
import { stableStringify } from '../useQuery/library/stableStringify';

export type { IUseInfiniteQueryProps, IUseInfiniteQueryResult } from './types';

type Row<TSchema extends AnySchema> = InferSelectModel<TSchema>;

interface State<TSchema extends AnySchema> {
  key: string;
  pages: Row<TSchema>[][];
  hasNextPage: boolean;
  error: unknown;
}

const NO_KEY = '\0'; // never matches a real `key`, so the first render never reports stale-but-loaded data.

/**
 * Paginated variant of `useQuery`: loads `pageSize` rows at a time via
 * `fetchNextPage()`, accumulating pages into `data`. Kept live the same way
 * `useQuery` is — any write to `schema`'s table (from any source) resets
 * back to page 0 and refetches, so pagination state never drifts from what's
 * on disk. Not meant for scroll-preserving "insert at the top" feeds — a
 * write always restarts from page 0.
 */
export const useInfiniteQuery = <TSchema extends AnySchema>(
  props: IUseInfiniteQueryProps<TSchema>,
): IUseInfiniteQueryResult<Row<TSchema>> => {
  const { schema, queryFn, pageSize, deps = [] } = props;

  const { isReady, isLoading: dbLoading, error: dbError } = useDatabaseReady();
  const key = `${schema.name}:${pageSize}:${stableStringify(deps)}`;

  const latest = useRef({ schema, queryFn, pageSize });
  latest.current = { schema, queryFn, pageSize };

  const [state, setState] = useState<State<TSchema>>({ key: NO_KEY, pages: [], hasNextPage: true, error: null });
  const stateRef = useRef(state);
  stateRef.current = state;

  // Mirror `pages.length`/`hasNextPage` outside React state, updated synchronously
  // before the paired `setState` call. `execute()` is synchronous end-to-end, so two
  // `fetchNextPage()` calls in the same tick (e.g. a double `onEndReached`) would
  // otherwise both read the same not-yet-committed `stateRef.current.pages.length`
  // and fetch the same offset twice instead of consecutive ones.
  const pageCountRef = useRef(0);
  const hasNextPageRef = useRef(true);

  const fetchPage = useCallback((pageIndex: number) => {
    const { schema, queryFn, pageSize } = latest.current;
    return queryFn(Database.select(schema)).limit(pageSize).offset(pageIndex * pageSize).execute();
  }, []);

  const reload = useCallback(() => {
    try {
      const firstPage = fetchPage(0);
      const hasNextPage = firstPage.length === latest.current.pageSize;
      pageCountRef.current = 1;
      hasNextPageRef.current = hasNextPage;
      setState({ key, pages: [firstPage], hasNextPage, error: null });
    } catch (error) {
      // Keep whatever was already on screen — a transient refetch failure shouldn't blank a loaded list.
      setState((prev) => ({ ...prev, error }));
    }
  }, [key, fetchPage]);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!isReady) return;
    reload();
  }, [isReady, reload]);

  useEffect(() => {
    if (!isReady) return;
    return queryCache.subscribeToTables([schema.name], () => reloadRef.current());
  }, [isReady, schema.name]);

  const fetchNextPage = useCallback(() => {
    if (stateRef.current.key !== key || !hasNextPageRef.current) return;

    const pageIndex = pageCountRef.current;
    pageCountRef.current += 1; // reserve the slot synchronously, before the fetch/setState below

    try {
      const nextPage = fetchPage(pageIndex);
      const hasNextPage = nextPage.length === latest.current.pageSize;
      hasNextPageRef.current = hasNextPage;
      setState((prev) => prev.key === key
        ? { key, pages: [...prev.pages, nextPage], hasNextPage, error: null }
        : prev);
    } catch (error) {
      pageCountRef.current -= 1; // this page never landed, release the reserved slot
      setState((prev) => prev.key === key ? { ...prev, error } : prev);
    }
  }, [key, fetchPage]);

  const isCurrent = isReady && state.key === key;
  const data = useMemo(() => isCurrent ? state.pages.flat() : null, [isCurrent, state.pages]);

  if (!Number.isInteger(pageSize) || pageSize <= 0) {
    throw new Error(`useInfiniteQuery: pageSize must be a positive integer, got ${pageSize}`);
  }

  return {
    data,
    error: dbError ?? (isCurrent ? state.error : null),
    isLoading: dbLoading || (isReady && !isCurrent),
    hasNextPage: isCurrent ? state.hasNextPage : true,
    fetchNextPage,
  };
};
