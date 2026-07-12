import type {
  ICacheEntry,
  IGetOrCreateEntryProps,
  IRunQueryProps,
  ISubscribeToEntryProps,
} from "./types";

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
  private readonly _entries = new Map<string, ICacheEntry<unknown>>();
  private _nativeSubscriptionId: number | null = null;

  constructor(
    private readonly _subscribeToChanges: (callback: (tables: string[]) => void) => number,
    private readonly _unsubscribeFromChanges: (id: number) => void,
  ) { }

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

  getOrCreateEntry<T>(props: IGetOrCreateEntryProps<T>): ICacheEntry<T> {
    const {
      key,
      tables,
      queryFn,
    } = props;
    const existing = this._entries.get(key) as ICacheEntry<T> | undefined;
    if (existing) {
      existing.queryFn = queryFn;
      return existing;
    }

    const entry = this._runQuery({ tables, queryFn, listeners: new Set(), previousData: null });
    this._entries.set(key, entry as ICacheEntry<unknown>);
    return entry;
  }

  subscribeToEntry(props: ISubscribeToEntryProps): () => void {
    const {
      key,
      listener,
    } = props;
    const entry = this._entries.get(key);
    if (!entry) return () => { };

    entry.listeners.add(listener);

    return () => {
      entry.listeners.delete(listener);

      if (entry.listeners.size === 0 && this._entries.get(key)?.listeners === entry.listeners) {
        this._entries.delete(key);
      }
    };
  }

  /** Must return a referentially stable value across calls unless the entry changed (useSyncExternalStore requirement). */
  getSnapshot(key: string): ICacheEntry<unknown> | undefined {
    return this._entries.get(key);
  }

  private _onTablesChanged(tables: string[]): void {
    const changed = new Set(tables);
    for (const [key, entry] of this._entries) {
      if (!entry.tables.some((table) => changed.has(table))) continue;
      if (entry.listeners.size === 0) continue;

      const next = this._runQuery({
        tables: entry.tables,
        queryFn: entry.queryFn,
        listeners: entry.listeners,
        previousData: entry.data,
      });
      this._entries.set(key, next as ICacheEntry<unknown>);
      next.listeners.forEach((listener) => listener());
    }
  }

  private _runQuery<T>(props: IRunQueryProps<T>): ICacheEntry<T> {
    const {
      listeners,
      queryFn,
      tables,
      previousData,
    } = props;
    try {
      return { data: queryFn(), error: null, tables, queryFn, listeners };
    } catch (error) {
      return { data: previousData, error, tables, queryFn, listeners };
    }
  }
}
