import type { HybridObject } from "react-native-nitro-modules";
import type { SqlValue, IQueryResult } from "./types/sql-value";
import type { ICompiledQuery } from "../types/query/compiled-query";

/**
 * JSI bridge for query execution and transactions. Calls the native Query
 * Executor.
 *
 * Marshaling decision: raw SQL + params cross as `string` +
 * {@linkcode SqlValue}`[]` (not an AST, not a full {@linkcode ICompiledQuery})
 * because the real bottleneck is disk I/O, not string assembly in JS — see
 * `docs/query-layer.md`. This format also enables a native prepared
 * statement cache keyed by SQL text. `SqlValue`, not `unknown`, because it
 * needs to be codegen-able by Nitrogen and mirror the C++ core's
 * `std::variant`; binary blobs travel as `ArrayBuffer` (zero-copy), not
 * base64.
 *
 * Transactions: `beginTransaction`/`commit`/`rollback`, not
 * `runInTransaction(queries[])`. The Query Builder (TASK-013) exposes
 * `db.transaction(async tx => {...})`, which runs arbitrary JS between
 * statements (e.g. reading a row to decide the next write) — a batch of
 * pre-compiled queries can't support that interactive pattern.
 */
export interface SalveQuery extends HybridObject<{ ios: "c++"; android: "c++" }> {
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
}
