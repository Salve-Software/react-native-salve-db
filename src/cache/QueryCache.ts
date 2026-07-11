type CacheEntry<T> = {
  data: T[] | null;
  error: unknown;
  tables: string[];
  queryFn: () => T[];
  listeners: Set<() => void>;
};

/**
 * Module-level singleton backing `useQuery`. Caches the last result per query
 * key and re-runs a query's `queryFn` whenever a table it reads from changes
 * (per-table invalidation, not per-row) — driven by a single native
 * `subscribeToChanges` subscription shared across every cached query,
 * established once by `SalveDbProvider`.
 *
 * Every entry mutation that changes `data`/`error` replaces the entry object
 * with a new reference (see `_runQuery`) — `useSyncExternalStore` compares
 * `getSnapshot()` results with `Object.is`, so mutating a cached entry in
 * place would never be seen as a change and the UI would silently go stale.
 */
export class QueryCache {
  private _entries = new Map<string, CacheEntry<unknown>>();
  private _nativeSubscriptionId: number | null = null;

  // No default here on purpose: defaulting to `Database.subscribeToChanges`
  // would import `Database.class.ts` (and transitively `react-native`) into
  // every consumer of this file, including tests that always inject fakes.
  // See `src/cache/index.ts` for the real, `Database`-backed singleton.
  constructor(
    private readonly _subscribeToChanges: (callback: (tables: string[]) => void) => number,
    private readonly _unsubscribeFromChanges: (id: number) => void,
  ) {}

  /** Establishes the single native subscription. Safe to call more than once. */
  subscribeNative(): void {
    if (this._nativeSubscriptionId !== null) return;
    this._nativeSubscriptionId = this._subscribeToChanges((tables) => this._onTablesChanged(tables));
  }

  /** Tears down the native subscription and clears every cached entry. */
  unsubscribeNative(): void {
    if (this._nativeSubscriptionId !== null) {
      this._unsubscribeFromChanges(this._nativeSubscriptionId);
      this._nativeSubscriptionId = null;
    }
    this._entries.clear();
  }

  getOrCreateEntry<T>(key: string, tables: string[], queryFn: () => T[]): CacheEntry<T> {
    const existing = this._entries.get(key) as CacheEntry<T> | undefined;
    if (existing) {
      // Refresh the closure only — doesn't change `data`/`error`, so the
      // reference stays stable and no re-render is triggered for this alone.
      existing.queryFn = queryFn;
      return existing;
    }

    const entry = this._runQuery(tables, queryFn, new Set());
    this._entries.set(key, entry as CacheEntry<unknown>);
    return entry;
  }

  subscribeToEntry(key: string, listener: () => void): () => void {
    const entry = this._entries.get(key);
    if (!entry) return () => {};

    entry.listeners.add(listener);
    return () => {
      entry.listeners.delete(listener);
      // Guard against evicting a newer entry that replaced this one at the same
      // key (e.g. a re-run from _onTablesChanged) — only delete if it's still
      // the exact entry this subscription was made against.
      if (entry.listeners.size === 0 && this._entries.get(key) === entry) {
        this._entries.delete(key);
      }
    };
  }

  /** Must return a referentially stable value across calls unless the entry changed (useSyncExternalStore requirement). */
  getSnapshot(key: string): CacheEntry<unknown> | undefined {
    return this._entries.get(key);
  }

  private _onTablesChanged(tables: string[]): void {
    const changed = new Set(tables);
    for (const [key, entry] of this._entries) {
      if (!entry.tables.some((table) => changed.has(table))) continue;

      const next = this._runQuery(entry.tables, entry.queryFn, entry.listeners, entry.data);
      this._entries.set(key, next as CacheEntry<unknown>);
      next.listeners.forEach((listener) => listener());
    }
  }

  private _runQuery<T>(
    tables: string[],
    queryFn: () => T[],
    listeners: Set<() => void>,
    previousData: T[] | null = null,
  ): CacheEntry<T> {
    try {
      return { data: queryFn(), error: null, tables, queryFn, listeners };
    } catch (error) {
      // Keep the last good data on screen instead of blanking it on a transient error.
      return { data: previousData, error, tables, queryFn, listeners };
    }
  }
}
