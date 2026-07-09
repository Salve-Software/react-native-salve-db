import type { JsonPath } from "../json-path";

/** Extração declarativa de campos da resposta HTTP de sync. */
export interface ResponseDefinition<TEntity> {
  cursor?: JsonPath;

  operations?: JsonPath;

  entities?: JsonPath;

  deleted?: JsonPath;

  metadata?: JsonPath;

  /** MVP: usado junto de PaginationDefinition pra controlar o loop de páginas. */
  hasMore?: JsonPath;
}
