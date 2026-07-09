/** Column definition inside an {@link ISchemaDefinition}. */
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

/**
 * Maps the declarative `type` of an {@link IColumnDefinition} to the corresponding TS type:
 *
 * | `IColumnDefinition.type` | TS |
 * |---|---|
 * | `text` | `string` |
 * | `integer` | `number` |
 * | `real` | `number` |
 * | `boolean` | `boolean` (SQLite stores 0/1; coercion happens in native) |
 * | `blob` | `Uint8Array` |
 * | `datetime` | `number` (epoch millis — same convention as `ISyncOperation.updatedAt`) |
 */
export type ColumnTsType<T extends IColumnDefinition["type"]> = T extends "text"
  ? string
  : T extends "integer"
    ? number
    : T extends "real"
      ? number
      : T extends "boolean"
        ? boolean
        : T extends "blob"
          ? Uint8Array
          : T extends "datetime"
            ? number
            : never;
