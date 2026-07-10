import type { IColumnDefinition } from "../../types";

/**
 * Scalar value crossing the JSI bridge in a native query, one per parameter
 * or result cell. Mirrors the C++ core's `std::variant` (SQLite): maps 1:1
 * to the 6 {@linkcode IColumnDefinition.type} values — `text`→`string`,
 * `integer`/`real`/`datetime`→`number` (datetime as epoch millis),
 * `boolean`→`boolean`, `blob`→`ArrayBuffer`, absent value→`null`.
 */
export type SqlValue = string | number | boolean | ArrayBuffer | null;