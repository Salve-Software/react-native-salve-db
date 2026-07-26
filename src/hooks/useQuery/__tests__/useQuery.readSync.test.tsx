import type { AnySchema } from '../../../types';
import type { SalveDatabase } from '../../../specs/SalveDatabase.nitro';
import type { SelectQueryBuilder } from '../../../database/classes/QueryDb/classes/SelectQueryBuilder';
import { SalveDbContext } from '../../../provider/SalveDbContext';
import type { IDatabaseReadyState } from '../../../provider/types';
import React from 'react';
import { act, renderHook } from '@testing-library/react-native';

const mockBridgeExecute = jest.fn();

jest.mock('../../../database', () => {
  const { SelectQueryBuilder } = require('../../../database/classes/QueryDb/classes/SelectQueryBuilder');
  return {
    Database: {
      select: (schema: AnySchema) => new SelectQueryBuilder(schema, { execute: mockBridgeExecute } as unknown as SalveDatabase),
    },
  };
});

const mockCache = {
  getOrCreateEntry: jest.fn(),
  subscribeToEntry: jest.fn((_props: { key: string, listener: () => void }) => () => {}),
  getSnapshot: jest.fn(),
};

jest.mock('../../../cache', () => ({ queryCache: mockCache }));

const mockRequestReadSync = jest.fn();
jest.mock('../../../sync', () => ({ requestReadSync: mockRequestReadSync }));

const { useQuery } = require('../index') as typeof import('../index');

function makeSyncSchema(name: string, enabled: boolean): AnySchema {
  return {
    name,
    version: 1,
    primaryKey: 'id',
    columns: {
      id: { type: 'integer' },
      label: { type: 'text' },
    },
    sync: {
      enabled,
      direction: 'bidirectional',
      conflict: 'lastWriteWins',
      transport: 'rest',
      endpoint: { basePath: `/${name}`, sinceParam: 'updatedAfter', limitParam: 'limit' },
    },
  };
}

const syncEnabledSchema: AnySchema = makeSyncSchema('orders', true);
const syncDisabledSchema: AnySchema = makeSyncSchema('orders-disabled', false);

const noSyncSchema: AnySchema = {
  name: 'items',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    label: { type: 'text' },
  },
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
  mockCache.subscribeToEntry.mockReturnValue(() => {});
  mockCache.getSnapshot.mockReturnValue(undefined);
});

describe('useQuery — read-triggered sync wiring', () => {
  test('a sync-enabled schema requests a read-triggered sync once ready', async () => {
    await renderHook(() => useQuery({ schema: syncEnabledSchema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }), {
      wrapper: withDbState(readyState),
    });

    expect(mockRequestReadSync).toHaveBeenCalledWith('orders');
  });

  test('a schema with no sync block never requests a read-triggered sync', async () => {
    await renderHook(() => useQuery({ schema: noSyncSchema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }), {
      wrapper: withDbState(readyState),
    });

    expect(mockRequestReadSync).not.toHaveBeenCalled();
  });

  test('a schema with sync.enabled: false never requests a read-triggered sync', async () => {
    await renderHook(() => useQuery({ schema: syncDisabledSchema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }), {
      wrapper: withDbState(readyState),
    });

    expect(mockRequestReadSync).not.toHaveBeenCalled();
  });

  test('a not-ready db never requests a read-triggered sync, even for a sync-enabled schema', async () => {
    await renderHook(() => useQuery({ schema: syncEnabledSchema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }), {
      wrapper: withDbState(notReadyState),
    });

    expect(mockRequestReadSync).not.toHaveBeenCalled();
  });

  test('the read never blocks on sync: result.current is identical in shape whether sync is enabled or not', async () => {
    mockCache.getSnapshot.mockReturnValue({ data: [], error: null, tables: ['orders'], queryFn: jest.fn(), listeners: new Set() });

    const { result: syncResult } = await renderHook(
      () => useQuery({ schema: syncEnabledSchema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }),
      { wrapper: withDbState(readyState) }
    );
    const { result: noSyncResult } = await renderHook(
      () => useQuery({ schema: noSyncSchema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }),
      { wrapper: withDbState(readyState) }
    );

    expect(syncResult.current).toEqual(noSyncResult.current);
    expect(syncResult.current.isLoading).toBe(false);
  });

  test('IUseQueryResult exposes no field beyond data/error/isLoading', async () => {
    const { result } = await renderHook(
      () => useQuery({ schema: syncEnabledSchema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }),
      { wrapper: withDbState(readyState) }
    );

    expect(Object.keys(result.current).sort()).toEqual(['data', 'error', 'isLoading']);
  });

  test('a rerender with stable props does not request another read-triggered sync', async () => {
    const { rerender } = await renderHook(
      () => useQuery({ schema: syncEnabledSchema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }),
      { wrapper: withDbState(readyState) }
    );

    expect(mockRequestReadSync).toHaveBeenCalledTimes(1);

    await act(() => { rerender({}); });

    expect(mockRequestReadSync).toHaveBeenCalledTimes(1);
  });

  test('switching to a different sync-enabled schema requests a sync for the new schema', async () => {
    const otherSchema: AnySchema = makeSyncSchema('invoices', true);

    const { rerender } = await renderHook(
      ({ schema }: { schema: AnySchema }) => useQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }),
      { wrapper: withDbState(readyState), initialProps: { schema: syncEnabledSchema } }
    );

    expect(mockRequestReadSync).toHaveBeenCalledWith('orders');

    await act(() => { rerender({ schema: otherSchema }); });

    expect(mockRequestReadSync).toHaveBeenCalledWith('invoices');
  });
});
