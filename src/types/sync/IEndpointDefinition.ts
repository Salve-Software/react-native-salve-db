/** REST module contract for one entity: the base path plus the two query-param names used by incremental pull. */
export interface IEndpointDefinition {
  /**
   * Base path of the entity's REST module, e.g. `"/users"`. Every route the
   * engine calls is relative to it: `GET <basePath>`, `POST <basePath>`,
   * `PATCH <basePath>/:id`, `DELETE <basePath>/:id`.
   */
  basePath: string;

  /**
   * Query-param name carrying the incremental-pull cursor (epoch millis),
   * e.g. `"updatedAfter"`. Configurable per schema so an existing backend
   * keeps its own convention instead of adapting to this library's.
   */
  sinceParam: string;

  /** Query-param name carrying the page size, e.g. `"limit"`. */
  limitParam: string;

  /** Extra headers merged into every request for this entity. */
  headers?: Record<string, string>;
}
