import type { ISchemaDefinition } from "./schema-definition";

/**
 * Generic constraint that accepts any {@link ISchemaDefinition}.
 *
 * The `any` here is intentional (mirrors Drizzle): `unknown` breaks `keyof TEntity`
 * in `ISchemaDefinition.primaryKey` when used as a generic bound — indexing `["default"]`
 * on a literal column that never declared that optional key resolves to `unknown` (not
 * `undefined`) in this mapped-type context, so checking the value would incorrectly make
 * every column without `default` optional. This is the only `any` in the package.
 */
export type AnySchema = ISchemaDefinition<any>;
