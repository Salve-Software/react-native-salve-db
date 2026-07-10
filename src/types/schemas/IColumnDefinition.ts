export interface IColumnDefinition {
  /** SQLite column type. */
  type: "text" | "integer" | "real" | "boolean" | "blob" | "datetime";

  /** If `true`, the column accepts `NULL`. */
  nullable?: boolean;

  /** If `true`, the column has a `UNIQUE` constraint. */
  unique?: boolean;

  /** Default value for the column. */
  default?: unknown;
}
