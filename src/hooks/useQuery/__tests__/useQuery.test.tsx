import type { AnySchema } from '../../../types';
import type { SalveDatabase } from '../../../specs/SalveDatabase.nitro';
import type { QueryResult } from '../../../specs/types';
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

const { useQuery } = require('../index') as typeof import('../index');

const schema: AnySchema = {
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
});

describe('useQuery — readiness gating', () => {
  test('does not touch the cache while the db is not ready', async () => {
    mockCache.getSnapshot.mockReturnValue(undefined);

    const { result } = await renderHook(() => useQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }), {
      wrapper: withDbState(notReadyState),
    });

    expect(mockCache.getOrCreateEntry).not.toHaveBeenCalled();
    expect(result.current).toEqual({ data: null, error: null, isLoading: true });
  });

  test('surfaces the provider error without querying', async () => {
    mockCache.getSnapshot.mockReturnValue(undefined);
    const providerError = new Error('configure failed');

    const { result } = await renderHook(() => useQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }), {
      wrapper: withDbState({ isReady: false, isLoading: false, error: providerError }),
    });

    expect(mockCache.getOrCreateEntry).not.toHaveBeenCalled();
    expect(result.current.error).toBe(providerError);
    expect(result.current.isLoading).toBe(false);
  });
});

describe('useQuery — once ready', () => {
  test('registers the query in the cache under a key derived from schema + deps', async () => {
    mockCache.getSnapshot.mockReturnValue(undefined);

    await renderHook(() => useQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10), deps: ['active'] }), {
      wrapper: withDbState(readyState),
    });

    expect(mockCache.getOrCreateEntry).toHaveBeenCalledTimes(1);
    const [{ key, tables, queryFn: run }] = mockCache.getOrCreateEntry.mock.calls[0];
    expect(key).toBe('items:["active"]');
    expect(tables).toEqual(['items']);
    expect(typeof run).toBe('function');
  });

  test('running the registered query executes against the real bridge and maps rows', async () => {
    mockCache.getSnapshot.mockReturnValue(undefined);
    mockBridgeExecute.mockReturnValue({ columns: ['id', 'label'], rows: [[1, 'a']] } satisfies QueryResult);

    await renderHook(() => useQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }), {
      wrapper: withDbState(readyState),
    });

    const [{ queryFn: run }] = mockCache.getOrCreateEntry.mock.calls[0];
    expect(run()).toEqual([{ id: 1, label: 'a' }]);
  });

  test('returns the cached entry data/error/loading from the cache snapshot', async () => {
    mockCache.getSnapshot.mockReturnValue({ data: [{ id: 1 }], error: null, tables: ['items'], queryFn: jest.fn(), listeners: new Set() });

    const { result } = await renderHook(() => useQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }), {
      wrapper: withDbState(readyState),
    });

    expect(result.current).toEqual({ data: [{ id: 1 }], error: null, isLoading: false });
  });

  test('re-renders when the cache notifies the subscribed listener', async () => {
    let capturedListener: (() => void) | null = null;
    mockCache.subscribeToEntry.mockImplementation(({ listener }: { key: string, listener: () => void }) => {
      capturedListener = listener;
      return () => {};
    });

    let snapshot: unknown = { data: [{ id: 1 }], error: null, tables: ['items'], queryFn: jest.fn(), listeners: new Set() };
    mockCache.getSnapshot.mockImplementation(() => snapshot);

    const { result } = await renderHook(() => useQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }), {
      wrapper: withDbState(readyState),
    });

    expect(result.current.data).toEqual([{ id: 1 }]);

    snapshot = { data: [{ id: 2 }], error: null, tables: ['items'], queryFn: jest.fn(), listeners: new Set() };
    await act(() => { capturedListener?.(); });

    expect(result.current.data).toEqual([{ id: 2 }]);
  });
});
