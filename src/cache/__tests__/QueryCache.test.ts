import { QueryCache } from '../QueryCache';

function makeCache() {
  let capturedListener: ((tables: string[]) => void) | null = null;
  const unsubscribe = jest.fn();
  const subscribe = jest.fn((listener: (tables: string[]) => void) => {
    capturedListener = listener;
    return 42;
  });
  const cache = new QueryCache(subscribe, unsubscribe);
  return {
    cache,
    subscribe,
    unsubscribe,
    fireNativeChange: (tables: string[]) => capturedListener?.(tables),
  };
}

describe('QueryCache — subscribeNative / unsubscribeNative', () => {
  test('subscribes exactly once even if called repeatedly', () => {
    const { cache, subscribe } = makeCache();
    cache.subscribeNative();
    cache.subscribeNative();
    cache.subscribeNative();
    expect(subscribe).toHaveBeenCalledTimes(1);
  });

  test('unsubscribeNative tears down the native subscription and clears entries', () => {
    const { cache, unsubscribe } = makeCache();
    cache.subscribeNative();
    cache.getOrCreateEntry('users', ['users'], () => [{ id: 1 }]);

    cache.unsubscribeNative();

    expect(unsubscribe).toHaveBeenCalledWith(42);
    expect(cache.getSnapshot('users')).toBeUndefined();
  });
});

describe('QueryCache — getOrCreateEntry', () => {
  test('runs the query once on first creation and caches the result', () => {
    const queryFn = jest.fn().mockReturnValue([{ id: 1 }]);
    const { cache } = makeCache();

    const entry = cache.getOrCreateEntry('users', ['users'], queryFn);

    expect(queryFn).toHaveBeenCalledTimes(1);
    expect(entry.data).toEqual([{ id: 1 }]);
    expect(entry.error).toBeNull();
  });

  test('returns the same entry reference on a second call with the same key, without re-running the query', () => {
    const queryFn = jest.fn().mockReturnValue([{ id: 1 }]);
    const { cache } = makeCache();

    const first = cache.getOrCreateEntry('users', ['users'], queryFn);
    const second = cache.getOrCreateEntry('users', ['users'], queryFn);

    expect(second).toBe(first);
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  test('captures an initial query error without throwing', () => {
    const error = new Error('boom');
    const queryFn = jest.fn().mockImplementation(() => { throw error; });
    const { cache } = makeCache();

    const entry = cache.getOrCreateEntry('users', ['users'], queryFn);

    expect(entry.data).toBeNull();
    expect(entry.error).toBe(error);
  });
});

describe('QueryCache — per-table invalidation', () => {
  test('re-runs and notifies only entries whose table was touched', () => {
    const { cache, fireNativeChange } = makeCache();
    cache.subscribeNative();

    let usersCallCount = 0;
    const usersEntry = cache.getOrCreateEntry('users', ['users'], () => {
      usersCallCount++;
      return [{ id: usersCallCount }];
    });
    let postsCallCount = 0;
    const postsEntry = cache.getOrCreateEntry('posts', ['posts'], () => {
      postsCallCount++;
      return [{ id: postsCallCount }];
    });

    const usersListener = jest.fn();
    const postsListener = jest.fn();
    cache.subscribeToEntry('users', usersListener);
    cache.subscribeToEntry('posts', postsListener);

    fireNativeChange(['users']);

    expect(usersCallCount).toBe(2);
    expect(postsCallCount).toBe(1); // untouched table, not re-run
    expect(usersListener).toHaveBeenCalledTimes(1);
    expect(postsListener).not.toHaveBeenCalled();

    // A new reference must be produced so useSyncExternalStore detects the change.
    expect(cache.getSnapshot('users')).not.toBe(usersEntry);
    expect(cache.getSnapshot('posts')).toBe(postsEntry);
  });

  test('keeps the previous data and surfaces the error when a re-run throws', () => {
    const { cache, fireNativeChange } = makeCache();
    cache.subscribeNative();

    let shouldThrow = false;
    cache.getOrCreateEntry('users', ['users'], () => {
      if (shouldThrow) throw new Error('refetch failed');
      return [{ id: 1 }];
    });

    shouldThrow = true;
    fireNativeChange(['users']);

    const entry = cache.getSnapshot('users');
    expect(entry?.data).toEqual([{ id: 1 }]); // stale data preserved, not blanked
    expect(entry?.error).toBeInstanceOf(Error);
  });

  test('getSnapshot returns the same reference across calls when nothing changed', () => {
    const { cache } = makeCache();
    cache.getOrCreateEntry('users', ['users'], () => [{ id: 1 }]);

    expect(cache.getSnapshot('users')).toBe(cache.getSnapshot('users'));
  });
});

describe('QueryCache — subscribeToEntry lifecycle', () => {
  test('evicts the entry once its last listener unsubscribes', () => {
    const { cache } = makeCache();
    cache.getOrCreateEntry('users', ['users'], () => [{ id: 1 }]);

    const unsubA = cache.subscribeToEntry('users', jest.fn());
    const unsubB = cache.subscribeToEntry('users', jest.fn());

    unsubA();
    expect(cache.getSnapshot('users')).toBeDefined(); // still one listener left

    unsubB();
    expect(cache.getSnapshot('users')).toBeUndefined();
  });

  test('unsubscribing from a key with no entry is a no-op', () => {
    const { cache } = makeCache();
    expect(() => cache.subscribeToEntry('missing', jest.fn())()).not.toThrow();
  });
});
