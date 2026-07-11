import type { IDatabaseReadyState } from '../../provider/types';
import { useContext } from 'react';
import { SalveDbContext } from '../../provider/SalveDbContext';

/**
 * Reads the database readiness state set by the nearest `SalveDbProvider`
 * ancestor: `{ isReady, isLoading, error }`. Used to gate screens/queries
 * until `configure`/`register` have finished, and to surface a boot-time
 * failure without crashing.
 */
export const useDatabaseReady = (): IDatabaseReadyState => {
  return useContext(SalveDbContext);
}
