import type { ColumnTsType } from "../schema/column-definition";
import type { AnySchema } from "../schema/any-schema";

/** Infere o modelo de leitura (linha retornada por `select`) de um schema. */
export type InferSelectModel<TSchema extends AnySchema> = {
  [K in keyof TSchema["columns"]]: ColumnTsType<TSchema["columns"][K]["type"]> | (TSchema["columns"][K]["nullable"] extends true ? null : never);
};

/** Infere o modelo de escrita (linha aceita por `insert`) de um schema. */
export type InferInsertModel<TSchema extends AnySchema> = {
  [K in keyof TSchema["columns"] as TSchema["columns"][K]["nullable"] extends true
    ? K
    : TSchema["columns"][K]["default"] extends undefined
      ? never
      : K]?: ColumnTsType<TSchema["columns"][K]["type"]>;
} & {
  [K in keyof TSchema["columns"] as TSchema["columns"][K]["nullable"] extends true
    ? never
    : TSchema["columns"][K]["default"] extends undefined
      ? K
      : never]: ColumnTsType<TSchema["columns"][K]["type"]>;
};
