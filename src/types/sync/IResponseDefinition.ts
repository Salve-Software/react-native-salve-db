import type { JsonPath } from "../JsonPath";

/** Declarative extraction of fields from the sync HTTP response. */
export interface IResponseDefinition<_TEntity> {
  cursor?: JsonPath;
  operations?: JsonPath;
  entities?: JsonPath;
  deleted?: JsonPath;
  metadata?: JsonPath;
  hasMore?: JsonPath;
}
