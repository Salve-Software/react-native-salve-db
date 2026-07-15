import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { createSalveDbProvider } from '../createSalveDbProvider';
import { useDatabaseReady } from '../../../hooks/useDatabaseReady';
import type { AnySchema } from '../../../types';

const schemaA: AnySchema = { name: 'a', version: 1, primaryKey: 'id', columns: { id: { type: 'integer' } } };
const schemaB: AnySchema = { name: 'b', version: 1, primaryKey: 'id', columns: { id: { type: 'integer' } } };

function flushMicrotasks() {
  return act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe('SalveDbProvider', () => {
  test('configures, registers every schema in order, then subscribes and flips isReady', async () => {
    const calls: string[] = [];
    const configure = jest.fn(() => { calls.push('configure'); });
    // `register('a')` is held open so the in-flight `isLoading` state below is
    // actually observed — @testing-library/react-native's async `act` drains
    // the whole microtask queue while awaiting `renderHook`, so a `register`
    // that resolves via a bare `Promise.resolve()` chain completes before
    // that `await` returns and the intermediate state is never visible.
    let resolveFirstRegister!: () => void;
    const register = jest.fn((schema: AnySchema) => {
      calls.push('register:' + schema.name);
      if (schema.name === schemaA.name) {
        return new Promise<void>((resolve) => { resolveFirstRegister = resolve; });
      }
      return Promise.resolve();
    });
    const subscribeNative = jest.fn(() => { calls.push('subscribeNative'); });
    const unsubscribeNative = jest.fn();
    const SalveDbProvider = createSalveDbProvider({ configure, register, subscribeNative, unsubscribeNative });

    const { result } = await renderHook(() => useDatabaseReady(), {
      wrapper: ({ children }) => (
        <SalveDbProvider config={{ name: 'db' }} schemas={[schemaA, schemaB]}>
          {children}
        </SalveDbProvider>
      ),
    });

    expect(result.current).toEqual({ isReady: false, isLoading: true, error: null });

    await act(async () => { resolveFirstRegister(); });
    await flushMicrotasks();

    expect(calls).toEqual(['configure', 'register:a', 'register:b', 'subscribeNative']);
    expect(result.current).toEqual({ isReady: true, isLoading: false, error: null });
  });

  test('surfaces a configure() throw as state.error, without registering or subscribing', async () => {
    const failure = new Error('configure failed');
    const configure = jest.fn(() => { throw failure; });
    const register = jest.fn().mockResolvedValue(undefined);
    const subscribeNative = jest.fn();
    const unsubscribeNative = jest.fn();
    const SalveDbProvider = createSalveDbProvider({ configure, register, subscribeNative, unsubscribeNative });

    const { result } = await renderHook(() => useDatabaseReady(), {
      wrapper: ({ children }) => (
        <SalveDbProvider config={{ name: 'db' }} schemas={[schemaA]}>
          {children}
        </SalveDbProvider>
      ),
    });

    await flushMicrotasks();

    expect(register).not.toHaveBeenCalled();
    expect(subscribeNative).not.toHaveBeenCalled();
    expect(result.current).toEqual({ isReady: false, isLoading: false, error: failure });
  });

  test('surfaces a register() rejection as state.error, without subscribing', async () => {
    const failure = new Error('register failed');
    const configure = jest.fn();
    const register = jest.fn().mockRejectedValue(failure);
    const subscribeNative = jest.fn();
    const unsubscribeNative = jest.fn();
    const SalveDbProvider = createSalveDbProvider({ configure, register, subscribeNative, unsubscribeNative });

    const { result } = await renderHook(() => useDatabaseReady(), {
      wrapper: ({ children }) => (
        <SalveDbProvider config={{ name: 'db' }} schemas={[schemaA]}>
          {children}
        </SalveDbProvider>
      ),
    });

    await flushMicrotasks();

    expect(configure).toHaveBeenCalledTimes(1);
    expect(subscribeNative).not.toHaveBeenCalled();
    expect(result.current).toEqual({ isReady: false, isLoading: false, error: failure });
  });

  test('does not configure/register twice under StrictMode double-invoked effects', async () => {
    const configure = jest.fn();
    const register = jest.fn().mockResolvedValue(undefined);
    const subscribeNative = jest.fn();
    const unsubscribeNative = jest.fn();
    const SalveDbProvider = createSalveDbProvider({ configure, register, subscribeNative, unsubscribeNative });

    await renderHook(() => useDatabaseReady(), {
      wrapper: ({ children }) => (
        <React.StrictMode>
          <SalveDbProvider config={{ name: 'db' }} schemas={[schemaA]}>
            {children}
          </SalveDbProvider>
        </React.StrictMode>
      ),
    });

    await flushMicrotasks();

    expect(configure).toHaveBeenCalledTimes(1);
    expect(register).toHaveBeenCalledTimes(1);
  });

  test('calls unsubscribeNative on unmount', async () => {
    const configure = jest.fn();
    const register = jest.fn().mockResolvedValue(undefined);
    const subscribeNative = jest.fn();
    const unsubscribeNative = jest.fn();
    const SalveDbProvider = createSalveDbProvider({ configure, register, subscribeNative, unsubscribeNative });

    const { unmount } = await renderHook(() => useDatabaseReady(), {
      wrapper: ({ children }) => (
        <SalveDbProvider config={{ name: 'db' }} schemas={[schemaA]}>
          {children}
        </SalveDbProvider>
      ),
    });

    await flushMicrotasks();
    expect(unsubscribeNative).not.toHaveBeenCalled();

    await act(async () => { unmount(); });

    expect(unsubscribeNative).toHaveBeenCalledTimes(1);
  });
});
