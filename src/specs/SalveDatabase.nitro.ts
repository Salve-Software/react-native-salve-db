import type { HybridObject } from "react-native-nitro-modules";
import type { ConfigureParams, SqlValue, QueryResult } from "./types";
import type { NativeSyncResult } from "../types/sync/NativeSyncResult";
import type { SyncQueueStatus } from "../types/sync/SyncQueueStatus";

export interface SalveDatabase extends HybridObject<{ ios: "c++"; android: "c++" }> {
  // ── Lifecycle ──────────────────────────────────────────────────────────────

  configure(params: ConfigureParams): void;

  /**
   * Registers a declarative schema, triggering the native Migration Engine
   * (version diff, automatic ADD COLUMN).
   * @param schemaJson JSON.stringify of a ISchemaDefinition.
   */
  registerSchema(schemaJson: string): Promise<void>;

  // ── Query ──────────────────────────────────────────────────────────────────

  /**
   * Executes parametrized SQL and returns the resulting rows, synchronously.
   * @param sql SQL text, used as the native prepared statement cache key.
   * @param params One SqlValue per positional placeholder in sql.
   */
  execute(sql: string, params: SqlValue[]): QueryResult;

  /** Starts a native transaction (BEGIN), synchronously. */
  beginTransaction(): void;

  /** Commits the active transaction, synchronously. */
  commit(): void;

  /** Rolls back the active transaction, synchronously. */
  rollback(): void;

  // ── Sync ───────────────────────────────────────────────────────────────────

  /**
   * Triggers a sync session for the given schema (foreground / on-open).
   * @param schemaName Name of an already-registered schema.
   */
  triggerSync(schemaName: string): Promise<NativeSyncResult>;

  /**
   * Reads `sync_queue` for `schemaName` without running a sync — how many
   * writes are waiting to go out, and since when. Synchronous: a single
   * indexed `COUNT`/`MIN`, no network involved.
   */
  getSyncQueueStatus(schemaName: string): SyncQueueStatus;

  // ── Change notification ─────────────────────────────────────────────────────

  /**
   * Subscribes to table-level write notifications (backed by sqlite3_update_hook).
   * Fires once per commit — or once per statement outside an explicit transaction —
   * listing every table touched, coalesced rather than per-row. Fires for every
   * write regardless of origin: the query builder, raw SQL, migrations, or the
   * native background sync engine.
   * @returns A subscription id, pass to unsubscribeFromChanges to stop listening.
   */
  subscribeToChanges(callback: (tables: string[]) => void): number;

  /** Stops a subscription previously created by subscribeToChanges. */
  unsubscribeFromChanges(id: number): void;

  // ── Debug ──────────────────────────────────────────────────────────────────

  /** Test-only: number of sqlite3_prepare_v2 calls, i.e. LRU cache misses. */
  debugPreparedStatementCount(): number;
}
