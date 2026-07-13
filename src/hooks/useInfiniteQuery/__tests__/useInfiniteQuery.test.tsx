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

const { useInfiniteQuery } = require('../index') as typeof import('../index');

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

function page(rows: [number, string][]): QueryResult {
  return { columns: ['id', 'label'], rows };
}

beforeEach(() => {
  jest.clearAllMocks();
  capturedTables = null;
  capturedListener = null;
});

describe('useInfiniteQuery — readiness gating', () => {
  test('does not query while the db is not ready', async () => {
    const { result } = await renderHook(
      () => useInfiniteQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q, pageSize: 2 }),
      { wrapper: withDbState(notReadyState) },
    );

    expect(mockBridgeExecute).not.toHaveBeenCalled();
    expect(result.current).toEqual({ data: null, error: null, isLoading: true, hasNextPage: true, fetchNextPage: expect.any(Function) });
  });
});

describe('useInfiniteQuery — invalid pageSize', () => {
  test('throws if pageSize is not a positive integer', async () => {
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    await expect(renderHook(
      () => useInfiniteQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q, pageSize: 0 }),
      { wrapper: withDbState(readyState) },
    )).rejects.toThrow('useInfiniteQuery: pageSize must be a positive integer, got 0');
    consoleError.mockRestore();
  });
});

describe('useInfiniteQuery — once ready', () => {
  test('loads the first page with the configured pageSize/offset', async () => {
    mockBridgeExecute.mockReturnValue(page([[1, 'a'], [2, 'b']]));

    const { result } = await renderHook(
      () => useInfiniteQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q, pageSize: 2 }),
      { wrapper: withDbState(readyState) },
    );

    expect(result.current.data).toEqual([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);
    expect(result.current.hasNextPage).toBe(true);
    const [sql] = mockBridgeExecute.mock.calls[0] as [string, unknown[]];
    expect(sql).toBe('SELECT * FROM "items" LIMIT 2 OFFSET 0');
  });

  test('subscribes to the shared queryCache table subscription, not a new native one', async () => {
    mockBridgeExecute.mockReturnValue(page([[1, 'a']]));

    await renderHook(
      () => useInfiniteQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q, pageSize: 2 }),
      { wrapper: withDbState(readyState) },
    );

    expect(mockSubscribeToTables).toHaveBeenCalledTimes(1);
    expect(capturedTables).toEqual(['items']);
  });

  test('a page shorter than pageSize means there is no next page', async () => {
    mockBridgeExecute.mockReturnValue(page([[1, 'a']]));

    const { result } = await renderHook(
      () => useInfiniteQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q, pageSize: 2 }),
      { wrapper: withDbState(readyState) },
    );

    expect(result.current.hasNextPage).toBe(false);
  });

  test('fetchNextPage() appends the next page and advances the offset', async () => {
    mockBridgeExecute.mockReturnValueOnce(page([[1, 'a'], [2, 'b']]));

    const { result } = await renderHook(
      () => useInfiniteQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q, pageSize: 2 }),
      { wrapper: withDbState(readyState) },
    );

    expect(result.current.data).toHaveLength(2);

    mockBridgeExecute.mockReturnValueOnce(page([[3, 'c']]));
    await act(() => { result.current.fetchNextPage(); });

    expect(result.current.data).toEqual([{ id: 1, label: 'a' }, { id: 2, label: 'b' }, { id: 3, label: 'c' }]);
    expect(result.current.hasNextPage).toBe(false);
    const [sql] = mockBridgeExecute.mock.calls[1] as [string, unknown[]];
    expect(sql).toBe('SELECT * FROM "items" LIMIT 2 OFFSET 2');
  });

  test('fetchNextPage() is a no-op once hasNextPage is false', async () => {
    mockBridgeExecute.mockReturnValue(page([[1, 'a']]));

    const { result } = await renderHook(
      () => useInfiniteQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q, pageSize: 2 }),
      { wrapper: withDbState(readyState) },
    );

    expect(result.current.hasNextPage).toBe(false);
    mockBridgeExecute.mockClear();

    await act(() => { result.current.fetchNextPage(); });

    expect(mockBridgeExecute).not.toHaveBeenCalled();
  });

  test('two fetchNextPage() calls in the same tick fetch consecutive offsets, not the same one twice', async () => {
    mockBridgeExecute.mockReturnValueOnce(page([[1, 'a'], [2, 'b']]));

    const { result } = await renderHook(
      () => useInfiniteQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q, pageSize: 2 }),
      { wrapper: withDbState(readyState) },
    );

    mockBridgeExecute.mockReturnValueOnce(page([[3, 'c'], [4, 'd']]));
    mockBridgeExecute.mockReturnValueOnce(page([[5, 'e'], [6, 'f']]));

    await act(() => {
      result.current.fetchNextPage();
      result.current.fetchNextPage();
    });

    const sqls = mockBridgeExecute.mock.calls.slice(1).map(([sql]) => sql);
    expect(sqls).toEqual([
      'SELECT * FROM "items" LIMIT 2 OFFSET 2',
      'SELECT * FROM "items" LIMIT 2 OFFSET 4',
    ]);
    expect(result.current.data).toEqual([
      { id: 1, label: 'a' }, { id: 2, label: 'b' },
      { id: 3, label: 'c' }, { id: 4, label: 'd' },
      { id: 5, label: 'e' }, { id: 6, label: 'f' },
    ]);
  });

  test('a write to the table resets back to page 0', async () => {
    mockBridgeExecute.mockReturnValueOnce(page([[1, 'a'], [2, 'b']]));

    const { result } = await renderHook(
      () => useInfiniteQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q, pageSize: 2 }),
      { wrapper: withDbState(readyState) },
    );

    mockBridgeExecute.mockReturnValueOnce(page([[3, 'c'], [4, 'd']]));
    await act(() => { result.current.fetchNextPage(); });
    expect(result.current.data).toHaveLength(4);

    mockBridgeExecute.mockReturnValueOnce(page([[9, 'z']]));
    await act(() => { capturedListener?.(); });

    expect(result.current.data).toEqual([{ id: 9, label: 'z' }]);
  });

  test('a transient reload error preserves already-loaded pages instead of blanking them', async () => {
    mockBridgeExecute.mockReturnValueOnce(page([[1, 'a'], [2, 'b']]));

    const { result } = await renderHook(
      () => useInfiniteQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q, pageSize: 2 }),
      { wrapper: withDbState(readyState) },
    );

    expect(result.current.data).toEqual([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);

    const boom = new Error('boom');
    mockBridgeExecute.mockImplementationOnce(() => { throw boom; });
    await act(() => { capturedListener?.(); });

    expect(result.current.data).toEqual([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);
    expect(result.current.error).toBe(boom);
  });

  test('unsubscribes from the shared table subscription on unmount', async () => {
    mockBridgeExecute.mockReturnValue(page([[1, 'a']]));

    const { unmount } = await renderHook(
      () => useInfiniteQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q, pageSize: 2 }),
      { wrapper: withDbState(readyState) },
    );

    await act(() => { unmount(); });

    expect(mockUnsubscribeFromTables).toHaveBeenCalledTimes(1);
  });
});
