import type { ColumnDefinition, ColumnTsType } from "../schema/column-definition";
import type { AnySchema } from "../schema/any-schema";

/**
 * Se uma coluna declara `default`. Checa a PRESENÇA da chave (`keyof`), não
 * se o valor faz `extends undefined` — indexar `["default"]` numa coluna
 * literal que nunca declarou essa chave opcional resolve pra `unknown`
 * (não pra `undefined`) nesse contexto de mapped type genérico, então checar
 * o valor faria toda coluna sem `default` virar opcional por engano.
 */
type ColumnHasDefault<C extends ColumnDefinition> = "default" extends keyof C ? true : false;

/** Infere o modelo de leitura (linha retornada por `select`) de um schema. */
export type InferSelectModel<TSchema extends AnySchema> = {
  [K in keyof TSchema["columns"]]: ColumnTsType<TSchema["columns"][K]["type"]> | (TSchema["columns"][K]["nullable"] extends true ? null : never);
};

/** Infere o modelo de escrita (linha aceita por `insert`) de um schema. */
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
