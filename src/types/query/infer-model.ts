import type { IColumnDefinition, ColumnTsType } from "../schema/column-definition";
import type { AnySchema } from "../schema/any-schema";

/**
 * Whether a column declares `default`. Checks for key PRESENCE (`keyof`), not
 * whether the value does `extends undefined`: indexing `["default"]` on a
 * literal column that never declared that optional key resolves to `unknown`
 * (not `undefined`) in this generic mapped type context, so checking the value
 * would incorrectly make every column without `default` optional.
 */
type ColumnHasDefault<C extends IColumnDefinition> = "default" extends keyof C ? true : false;

/** Infers the read model (row returned by `select`) from a schema. */
export type InferSelectModel<TSchema extends AnySchema> = {
  [K in keyof TSchema["columns"]]: ColumnTsType<TSchema["columns"][K]["type"]> | (TSchema["columns"][K]["nullable"] extends true ? null : never);
};

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
