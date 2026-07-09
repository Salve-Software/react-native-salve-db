import type { JsonPath } from "../json-path";

/** Declarative extraction of fields from the sync HTTP response. */
export interface IResponseDefinition<_TEntity> {
  cursor?: JsonPath;

  operations?: JsonPath;

  entities?: JsonPath;

  deleted?: JsonPath;

  metadata?: JsonPath;

  /** MVP: used together with IPaginationDefinition to control the page loop. */
  hasMore?: JsonPath;
}
