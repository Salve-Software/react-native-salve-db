import type { AnySchema } from '../../types';
import type { IUseSyncStatusResult } from './types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Database } from '../../database';
import { queryCache } from '../../cache';
import { useDatabaseReady } from '../useDatabaseReady';

export type { IUseSyncStatusResult } from './types';

interface State {
  schemaName: string | null;
  status: IUseSyncStatusResult['status'];
  error: unknown;
}

/**
 * Reads `sync_queue` for `schema` — how many local writes haven't been sent
 * to the server yet, and since when — without running a sync. Kept live:
 * any write to `schema`'s table (which also writes to `sync_queue` via the
 * trigger engine) refreshes it automatically.
 */
export const useSyncStatus = <TSchema extends AnySchema>(schema: TSchema): IUseSyncStatusResult => {
  const { isReady, isLoading: dbLoading, error: dbError } = useDatabaseReady();

  // Keyed off `schema.name` (a stable primitive), not `schema` itself — a caller passing an
  // inline schema literal would otherwise recreate `reload`'s identity every render, retriggering
  // the effect below in a loop. `latest` still tracks the full schema object so `reload` calls
  // the bridge with whatever was passed most recently.
  const latest = useRef(schema);
  latest.current = schema;

  const [state, setState] = useState<State>({ schemaName: null, status: null, error: null });

  const reload = useCallback(() => {
    try {
      const status = Database.getSyncQueueStatus(latest.current);
      setState({ schemaName: latest.current.name, status, error: null });
    } catch (error) {
      // Keep whatever was already on screen — a transient read failure shouldn't blank a known status.
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
