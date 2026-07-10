import type { AnySchema, ColumnTsType } from "../../../../../../types";

/** Infers the read model (row returned by `select`) from a schema. */
export type InferSelectModel<TSchema extends AnySchema> = {
  [K in keyof TSchema["columns"]]: ColumnTsType<TSchema["columns"][K]["type"]> | (TSchema["columns"][K]["nullable"] extends true ? null : never);
};
