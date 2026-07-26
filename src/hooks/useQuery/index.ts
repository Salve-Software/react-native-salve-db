import type { AnySchema } from '../../types';
import type { IUseQueryProps, IUseQueryResult } from './types';
import type { InferSelectModel } from '../../database/classes/QueryDb/classes/SelectQueryBuilder/types';
import { useCallback, useEffect, useRef, useSyncExternalStore } from 'react';
import { Database } from '../../database';
import { queryCache } from '../../cache';
import { requestReadSync } from '../../sync';
import { useDatabaseReady } from '../useDatabaseReady';
import { stableStringify } from './library/stableStringify';

export type { IUseQueryProps, IUseQueryResult } from './types';

/**
 * Runs a `select` query against `schema`, cached and kept live: it
 * automatically re-runs and re-renders whenever a write touches `schema`'s
 * table, no matter the source (this hook, another screen, or native
 * background sync).
 */
export const useQuery = <TSchema extends AnySchema>(props: IUseQueryProps<TSchema>): IUseQueryResult<InferSelectModel<TSchema>> => {
  const {
    schema,
    queryFn,
    deps = [],
  } = props;

  const { isReady, isLoading: dbLoading, error: dbError } = useDatabaseReady();
  const key = `${schema.name}:${stableStringify(deps)}`;

  const latest = useRef({ schema, queryFn });
  latest.current = { schema, queryFn };

  const run = useCallback(() => {
    const { schema, queryFn } = latest.current;
    return queryFn(Database.select(schema)).execute();
  }, []);

  if (isReady) {
    queryCache.getOrCreateEntry({ key, tables: [schema.name], queryFn: run });
  }

  const subscribe = useCallback((onStoreChange: () => void) => {
    return queryCache.subscribeToEntry({ key, listener: onStoreChange });
  }, [key, isReady]);

  const getSnapshot = useCallback(() => {
    return queryCache.getSnapshot(key);
  }, [key]);

  const entry = useSyncExternalStore(subscribe, getSnapshot);

  const isSyncEnabled = schema.sync?.enabled === true;

  useEffect(() => {
    if (!isReady || !isSyncEnabled) return;
    requestReadSync(schema.name);
  }, [isReady, isSyncEnabled, schema.name, key]);

  return {
    data: (entry?.data as InferSelectModel<TSchema>[] | null) ?? null,
    error: dbError ?? entry?.error ?? null,
    isLoading: dbLoading || (isReady && entry === undefined),
  };
}
