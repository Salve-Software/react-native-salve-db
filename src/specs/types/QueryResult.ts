import type { SqlValue } from "./SqlValue";

/**
 * Result of a native query. `columns` arrives once per result (not once per
 * row) and `rows[i][j]` corresponds to `columns[j]` — Nitrogen can't
 * generate a native struct for a dynamic-key `Record<string, T>` (column
 * keys vary per query), so the result travels as columns + a value matrix
 * instead of one object per row.
 */
export interface QueryResult {
  columns: string[];
  rows: SqlValue[][];
}
