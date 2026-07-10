import type { HybridObject } from "react-native-nitro-modules";
import type { IDatabaseConfigDefinition } from "../types/sync/database-config-definition";
import type { ISchemaDefinition } from "../types/schema/schema-definition";
import type { RequestExpression } from "../types/sync/request-expression";
import type { SqlValue, IQueryResult } from "./types/sql-value";
import type { ICompiledQuery } from "../types/query/compiled-query";
import type { INativeSyncResult } from "../types/sync/native-sync-result";

/**
 * JSI bridge for the whole native database core: lifecycle (configure,
 * schema registration), query execution/transactions, and manual/on-open
 * sync. A single HybridObject because all three groups of methods already
 * reach the same native singleton connection — splitting them bought no
 * real lifecycle/capability isolation, just three autolinked entries hitting
 * one `DatabaseManager`.
 *
 * `configure`/`registerSchema` accept a JSON `string` payload, not a Nitro
 * struct: {@linkcode IDatabaseConfigDefinition} and {@linkcode ISchemaDefinition}
 * use generics, `keyof`, a dynamic-key `Record`, and recursive unions
 * ({@linkcode RequestExpression}) that Nitrogen can't generate as a native
 * struct. Both calls are cold-path (once per app / once per schema), so the
 * `JSON.stringify`/parse cost is irrelevant — JS serializes the real type,
 * C++ parses it.
 *
 * `execute`/transactions marshaling decision: raw SQL + params cross as
 * `string` + {@linkcode SqlValue}`[]` (not an AST, not a full
 * {@linkcode ICompiledQuery}) because the real bottleneck is disk I/O, not
 * string assembly in JS — see `docs/query-layer.md`. This format also
 * enables a native prepared statement cache keyed by SQL text. `SqlValue`,
 * not `unknown`, because it needs to be codegen-able by Nitrogen and mirror
 * the C++ core's `std::variant`; binary blobs travel as `ArrayBuffer`
 * (zero-copy), not base64.
 *
 * Transactions: `beginTransaction`/`commit`/`rollback`, not
 * `runInTransaction(queries[])`. The Query Builder (TASK-013) exposes
 * `db.transaction(async tx => {...})`, which runs arbitrary JS between
 * statements (e.g. reading a row to decide the next write) — a batch of
 * pre-compiled queries can't support that interactive pattern.
 *
 * `triggerSync` calls the native Sync Orchestrator, which runs the full page
 * cycle (read `sync_queue` → send → apply → advance cursor) without
 * involving JS during execution.
 */
export interface SalveDatabase extends HybridObject<{ ios: "c++"; android: "c++" }> {
  /**
   * Configures the global connection (baseUrl, credentials, network timeout).
   * @param configJson `JSON.stringify` of a {@linkcode IDatabaseConfigDefinition}.
   */
  configure(configJson: string): void;

  /**
   * Registers a declarative schema, triggering the native Migration Engine
   * (version diff, automatic `ADD COLUMN`).
   * @param schemaJson `JSON.stringify` of a {@linkcode ISchemaDefinition}.
   */
  registerSchema(schemaJson: string): Promise<void>;

  /**
   * Executes parametrized SQL and returns the resulting rows.
   * @param sql SQL text, used as the native prepared statement cache key.
   * @param params One {@linkcode SqlValue} per positional placeholder in `sql`.
   */
  execute(sql: string, params: SqlValue[]): Promise<IQueryResult>;

  /** Starts a native transaction (`BEGIN`). Subsequent {@linkcode execute} calls stay inside it until {@linkcode commit} or {@linkcode rollback}. */
  beginTransaction(): Promise<void>;

  /** Commits the transaction started by {@linkcode beginTransaction}. */
  commit(): Promise<void>;

  /** Rolls back the transaction started by {@linkcode beginTransaction}. */
  rollback(): Promise<void>;

  /**
   * Triggers a sync session for the given schema.
   * @param schemaName Name of an already-registered {@linkcode ISchemaDefinition} (see {@linkcode registerSchema}).
   */
  triggerSync(schemaName: string): Promise<INativeSyncResult>;
}
