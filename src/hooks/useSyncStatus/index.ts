import type { AnySchema } from '../../types';
import type { IState, IUseSyncStatusResult } from './types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Database } from '../../database';
import { queryCache } from '../../cache';
import { useDatabaseReady } from '../useDatabaseReady';

export type { IUseSyncStatusResult } from './types';

/**
 * Reads `sync_queue` for `schema` — how many local writes haven't been sent
 * to the server yet, and since when — without running a sync. Kept live:
 * any write to `schema`'s table (which also writes to `sync_queue` via the
 * trigger engine) refreshes it automatically.
 */
export const useSyncStatus = <TSchema extends AnySchema>(schema: TSchema): IUseSyncStatusResult => {
  const { isReady, isLoading: dbLoading, error: dbError } = useDatabaseReady();

  const latest = useRef(schema);
  latest.current = schema;

  const [state, setState] = useState<IState>({ schemaName: null, status: null, error: null });

  const reload = useCallback(() => {
    try {
      const status = Database.getSyncQueueStatus(latest.current);
      setState({ schemaName: latest.current.name, status, error: null });
    } catch (error) {
      setState((prev) => ({ ...prev, error }));
    }
  }, [schema.name]);

  const reloadRef = useRef(reload);
  reloadRef.current = reload;

  useEffect(() => {
    if (!isReady) return;
    reload();
  }, [isReady, reload]);

  useEffect(() => {
    if (!isReady) return;
    return queryCache.subscribeToTables(['sync_queue'], () => reloadRef.current());
  }, [isReady, schema.name]);

  const isCurrent = isReady && state.schemaName === schema.name;

  return {
    status: isCurrent ? state.status : null,
    error: dbError ?? (isCurrent ? state.error : null),
    isLoading: dbLoading || (isReady && !isCurrent),
  };
};
