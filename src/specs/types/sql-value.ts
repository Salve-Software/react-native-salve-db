import type { IColumnDefinition } from "../../types/schema/column-definition";

/**
 * Scalar value crossing the JSI bridge in a native query, one per parameter
 * or result cell. Mirrors the C++ core's `std::variant` (SQLite): maps 1:1
 * to the 6 {@linkcode IColumnDefinition.type} values — `text`→`string`,
 * `integer`/`real`/`datetime`→`number` (datetime as epoch millis),
 * `boolean`→`boolean`, `blob`→`ArrayBuffer`, absent value→`null`.
 */
export type SqlValue = string | number | boolean | ArrayBuffer | null;

/**
 * Result of a native query. `columns` arrives once per result (not once per
 * row) and `rows[i][j]` corresponds to `columns[j]` — Nitrogen can't
 * generate a native struct for a dynamic-key `Record<string, T>` (column
 * keys vary per query), so the result travels as columns + a value matrix
 * instead of one object per row.
 */
export interface IQueryResult {
  columns: string[];
  rows: SqlValue[][];
}
