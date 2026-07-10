import type { IColumnDefinition } from "./IColumnDefinition";

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
