import type { HybridObject } from "react-native-nitro-modules";
import type { IConfigureParams, SqlValue, IQueryResult } from "./types";
import type { INativeSyncResult } from "../types/sync/INativeSyncResult";

export interface SalveDatabase extends HybridObject<{ ios: "c++"; android: "c++" }> {
  // ── Lifecycle ──────────────────────────────────────────────────────────────

  configure(params: IConfigureParams): void;

  /**
   * Registers a declarative schema, triggering the native Migration Engine
   * (version diff, automatic ADD COLUMN).
   * @param schemaJson JSON.stringify of a ISchemaDefinition.
   */
  registerSchema(schemaJson: string): Promise<void>;

  // ── Query ──────────────────────────────────────────────────────────────────

  /**
   * Executes parametrized SQL and returns the resulting rows.
   * @param sql SQL text, used as the native prepared statement cache key.
   * @param params One SqlValue per positional placeholder in sql.
   */
  execute(sql: string, params: SqlValue[]): Promise<IQueryResult>;

  /** Starts a native transaction (BEGIN). */
  beginTransaction(): Promise<void>;

  /** Commits the active transaction. */
  commit(): Promise<void>;

  /** Rolls back the active transaction. */
  rollback(): Promise<void>;

  // ── Sync ───────────────────────────────────────────────────────────────────

  /**
   * Triggers a sync session for the given schema (foreground / on-open).
   * @param schemaName Name of an already-registered schema.
   */
  triggerSync(schemaName: string): Promise<INativeSyncResult>;
}
