import type { RequestExpression } from "./RequestExpression";

/** Declarative body of a sync request. */
export interface IRequestDefinition<_TEntity> {
  body: Record<string, RequestExpression>;
}
