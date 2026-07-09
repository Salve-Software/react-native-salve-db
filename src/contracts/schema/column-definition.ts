/** Definição de uma coluna de um {@link SchemaDefinition}. */
export interface ColumnDefinition {
  /** Tipo SQLite da coluna. */
  type: "text" | "integer" | "real" | "boolean" | "blob" | "datetime";

  /** Se `true`, a coluna aceita `NULL`. */
  nullable?: boolean;

  /** Se `true`, a coluna tem constraint `UNIQUE`. */
  unique?: boolean;

  /** Valor default da coluna. */
  default?: unknown;
}

/**
 * Mapeia o `type` declarativo de um {@link ColumnDefinition} pro tipo TS
 * correspondente:
 *
 * | `ColumnDefinition.type` | TS |
 * |---|---|
 * | `text` | `string` |
 * | `integer` | `number` |
 * | `real` | `number` |
 * | `boolean` | `boolean` (SQLite guarda 0/1, coerção fica no native) |
 * | `blob` | `Uint8Array` |
 * | `datetime` | `number` (epoch millis — mesma convenção de `SyncOperation.updatedAt`) |
 */
export type ColumnTsType<T extends ColumnDefinition["type"]> = T extends "text"
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
