import type { AnySchema } from '../../types';
import type { IUseInfiniteQueryProps, IUseInfiniteQueryResult, Row, IState } from './types';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Database } from '../../database';
import { queryCache } from '../../cache';
import { useDatabaseReady } from '../useDatabaseReady';
import { stableStringify } from '../useQuery/library/stableStringify';
import { NO_KEY } from './constants';

export type { IUseInfiniteQueryProps, IUseInfiniteQueryResult } from './types';

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

  const [state, setState] = useState<IState<TSchema>>({ key: NO_KEY, pages: [], hasNextPage: true, error: null });
  const stateRef = useRef(state);
  stateRef.current = state;

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
      setState((prev) => (prev.key === key ? { ...prev, error } : { key, pages: [], hasNextPage: true, error }));
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
    pageCountRef.current += 1;

    try {
      const nextPage = fetchPage(pageIndex);
      const hasNextPage = nextPage.length === latest.current.pageSize;
      hasNextPageRef.current = hasNextPage;
      setState((prev) => prev.key === key
        ? { key, pages: [...prev.pages, nextPage], hasNextPage, error: null }
        : prev);
    } catch (error) {
      pageCountRef.current -= 1;
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
