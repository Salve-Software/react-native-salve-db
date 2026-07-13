import type { AnySchema } from '../../../types';
import type { SyncQueueStatus } from '../../../types/sync/SyncQueueStatus';
import { SalveDbContext } from '../../../provider/SalveDbContext';
import type { IDatabaseReadyState } from '../../../provider/types';
import React from 'react';
import { act, renderHook } from '@testing-library/react-native';

const mockGetSyncQueueStatus = jest.fn();

jest.mock('../../../database', () => ({
  Database: {
    getSyncQueueStatus: (schema: AnySchema) => mockGetSyncQueueStatus(schema),
  },
}));

let capturedTables: string[] | null = null;
const mockUnsubscribeFromTables = jest.fn();
const mockSubscribeToTables = jest.fn((tables: string[], _listener: () => void) => {
  capturedTables = tables;
  return mockUnsubscribeFromTables;
});
let capturedListener: (() => void) | null = null;

jest.mock('../../../cache', () => ({
  queryCache: {
    subscribeToTables: (tables: string[], listener: () => void) => {
      capturedListener = listener;
      return mockSubscribeToTables(tables, listener);
    },
  },
}));

const { useSyncStatus } = require('../index') as typeof import('../index');

const schema: AnySchema = {
  name: 'customers',
  version: 1,
  primaryKey: 'id',
  columns: { id: { type: 'integer' } },
};

function withDbState(state: IDatabaseReadyState) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <SalveDbContext.Provider value={state}>{children}</SalveDbContext.Provider>;
  };
}

const readyState: IDatabaseReadyState = { isReady: true, isLoading: false, error: null };
const notReadyState: IDatabaseReadyState = { isReady: false, isLoading: true, error: null };

beforeEach(() => {
  jest.clearAllMocks();
  capturedTables = null;
  capturedListener = null;
});

describe('useSyncStatus — readiness gating', () => {
  test('does not query while the db is not ready', async () => {
    const { result } = await renderHook(() => useSyncStatus(schema), { wrapper: withDbState(notReadyState) });

    expect(mockGetSyncQueueStatus).not.toHaveBeenCalled();
    expect(result.current).toEqual({ status: null, error: null, isLoading: true });
  });
});

describe('useSyncStatus — once ready', () => {
  test('reads the status for the given schema', async () => {
    const status: SyncQueueStatus = { pendingCount: 3, oldestPendingUpdatedAt: 1700000000000 };
    mockGetSyncQueueStatus.mockReturnValue(status);

    const { result } = await renderHook(() => useSyncStatus(schema), { wrapper: withDbState(readyState) });

    expect(result.current).toEqual({ status, error: null, isLoading: false });
    expect(mockGetSyncQueueStatus).toHaveBeenCalledWith(schema);
  });

  test('subscribes to the shared queryCache "sync_queue" table subscription', async () => {
    mockGetSyncQueueStatus.mockReturnValue({ pendingCount: 0 });

    await renderHook(() => useSyncStatus(schema), { wrapper: withDbState(readyState) });

    expect(mockSubscribeToTables).toHaveBeenCalledTimes(1);
    expect(capturedTables).toEqual(['sync_queue']);
  });

  test('an inline schema literal recreated every render does not cause a reload loop', async () => {
    mockGetSyncQueueStatus.mockReturnValue({ pendingCount: 1 });

    const { result } = await renderHook(
      () => useSyncStatus({ name: 'customers', version: 1, primaryKey: 'id', columns: { id: { type: 'integer' } } } as AnySchema),
      { wrapper: withDbState(readyState) },
    );

    expect(result.current.status).toEqual({ pendingCount: 1 });
    expect(mockGetSyncQueueStatus).toHaveBeenCalledTimes(1);
    expect(mockSubscribeToTables).toHaveBeenCalledTimes(1);
  });

  test('a write to sync_queue re-reads the status', async () => {
    mockGetSyncQueueStatus.mockReturnValueOnce({ pendingCount: 1 });

    const { result } = await renderHook(() => useSyncStatus(schema), { wrapper: withDbState(readyState) });
    expect(result.current.status).toEqual({ pendingCount: 1 });

    mockGetSyncQueueStatus.mockReturnValueOnce({ pendingCount: 2, oldestPendingUpdatedAt: 42 });
    await act(() => { capturedListener?.(); });

    expect(result.current.status).toEqual({ pendingCount: 2, oldestPendingUpdatedAt: 42 });
  });

  test('a transient read error preserves the last known status instead of blanking it', async () => {
    mockGetSyncQueueStatus.mockReturnValueOnce({ pendingCount: 1 });

    const { result } = await renderHook(() => useSyncStatus(schema), { wrapper: withDbState(readyState) });
    expect(result.current.status).toEqual({ pendingCount: 1 });

    const boom = new Error('boom');
    mockGetSyncQueueStatus.mockImplementationOnce(() => { throw boom; });
    await act(() => { capturedListener?.(); });

    expect(result.current.status).toEqual({ pendingCount: 1 });
    expect(result.current.error).toBe(boom);
  });

  test('unsubscribes from the shared table subscription on unmount', async () => {
    mockGetSyncQueueStatus.mockReturnValue({ pendingCount: 0 });

    const { unmount } = await renderHook(() => useSyncStatus(schema), { wrapper: withDbState(readyState) });
    await act(() => { unmount(); });

    expect(mockUnsubscribeFromTables).toHaveBeenCalledTimes(1);
  });
});
