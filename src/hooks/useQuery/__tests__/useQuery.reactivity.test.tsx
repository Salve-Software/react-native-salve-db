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

let capturedNativeCallback: ((tables: string[]) => void) | null = null;

jest.mock('../../../cache', () => {
  const { QueryCache } = require('../../../cache/QueryCache.class');
  const cache = new QueryCache(
    (callback: (tables: string[]) => void) => {
      capturedNativeCallback = callback;
      return 0;
    },
    () => {},
  );
  cache.subscribeNative();
  return { queryCache: cache };
});

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

const notReadyState: IDatabaseReadyState = { isReady: false, isLoading: true, error: null };
const readyState: IDatabaseReadyState = { isReady: true, isLoading: false, error: null };

beforeEach(() => {
  mockBridgeExecute.mockReset();
});

/**
 * Regression test for a bug where `useQuery`'s `subscribe` (passed to
 * `useSyncExternalStore`) was memoized only on `key`. When the very first
 * render happened before the db was ready, `subscribeToEntry` found no
 * cache entry yet (nothing to subscribe to) and returned a no-op. Once the
 * db became ready, React never re-invoked `subscribe` (same identity), so
 * the listener was never actually attached — a real native write updated
 * the cache entry silently, but the component only reflected it on the
 * next unrelated re-render.
 */
describe('useQuery — reactivity across a not-ready → ready transition', () => {
  test('a native write notification updates the hook even if isReady flips after the first render', async () => {
    mockBridgeExecute.mockReturnValue({ columns: ['id', 'label'], rows: [[1, 'a']] } satisfies QueryResult);

    let dbState: IDatabaseReadyState = notReadyState;
    function Wrapper({ children }: { children: React.ReactNode }) {
      return <SalveDbContext.Provider value={dbState}>{children}</SalveDbContext.Provider>;
    }

    const { result, rerender } = await renderHook(
      () => useQuery({ schema, queryFn: (q: SelectQueryBuilder<AnySchema>) => q.limit(10) }),
      { wrapper: Wrapper },
    );

    expect(result.current).toEqual({ data: null, error: null, isLoading: true });

    dbState = readyState;
    await act(async () => rerender());

    expect(result.current.data).toEqual([{ id: 1, label: 'a' }]);
    expect(capturedNativeCallback).not.toBeNull();

    mockBridgeExecute.mockReturnValue({ columns: ['id', 'label'], rows: [[1, 'a'], [2, 'b']] } satisfies QueryResult);

    await act(async () => capturedNativeCallback?.(['items']));

    expect(result.current.data).toEqual([{ id: 1, label: 'a' }, { id: 2, label: 'b' }]);
  });
});
