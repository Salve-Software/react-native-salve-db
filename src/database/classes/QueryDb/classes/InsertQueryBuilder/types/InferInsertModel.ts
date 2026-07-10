import type { AnySchema, ColumnTsType, IColumnDefinition } from "../../../../../../types";

type ColumnHasDefault<C extends IColumnDefinition> = "default" extends keyof C ? true : false;

/** Infers the write model (row accepted by `insert`) from a schema. */
export type InferInsertModel<TSchema extends AnySchema> = {
  [K in keyof TSchema["columns"] as TSchema["columns"][K]["nullable"] extends true
    ? K
    : ColumnHasDefault<TSchema["columns"][K]> extends true
      ? K
      : never]?: ColumnTsType<TSchema["columns"][K]["type"]>;
} & {
  [K in keyof TSchema["columns"] as TSchema["columns"][K]["nullable"] extends true
    ? never
    : ColumnHasDefault<TSchema["columns"][K]> extends true
      ? never
      : K]: ColumnTsType<TSchema["columns"][K]["type"]>;
};
