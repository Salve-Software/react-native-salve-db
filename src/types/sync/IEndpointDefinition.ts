/**
 * REST module contract for one entity: the base path plus the `{token}`
 * templates that build the item route and the list-query string. See
 * docs/sync-rest-contract.md for the full template mechanism (#115) —
 * deliberately not RFC 6570, resolved against a closed vocabulary per
 * context: `itemPathTemplate` only sees `{basePath}`/`{id}`;
 * `listQueryTemplate` only sees `{since}`/`{limit}`/`{cursorField}`.
 */
export interface IEndpointDefinition {
  /**
   * Base path of the entity's REST module, e.g. `"/users"`. Every route the
   * engine calls is relative to it: `GET <basePath>`, `POST <basePath>`,
   * `PATCH <basePath>/:id`, `DELETE <basePath>/:id` (by default — see
   * `itemPathTemplate`).
   */
  basePath: string;

  /**
   * Template for the single-item route used by `PATCH`/`DELETE`, e.g.
   * `"{basePath}({id})"` for an OData-style API. Tokens: `{basePath}`,
   * `{id}`. `{id}` is always percent-encoded; `{basePath}` is inserted raw.
   * @default "{basePath}/{id}"
   */
  itemPathTemplate?: string;

  /**
   * Template for the pull's query string, e.g.
   * `"updatedAfter={since}&limit={limit}"`, or a composed filter like
   * `"$filter={cursorField} gt {since}&$top={limit}"`. Tokens: `{since}`,
   * `{limit}`, `{cursorField}` — always percent-encoded. Required: there is
   * no fallback, every schema must declare its own query shape explicitly.
   */
  listQueryTemplate: string;

  /**
   * Field name (in each pulled row's JSON) carrying that row's timestamp —
   * read from the last row of a page to advance the incremental-pull
   * cursor. Required regardless of `sync.conflict.strategy`: pagination
   * needs it independent of how conflicts get resolved.
   * @default "updatedAt"
   */
  cursorField?: string;

  /** Extra headers merged into every request for this entity. */
  headers?: Record<string, string>;
}
