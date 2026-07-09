import type { RequestExpression } from "./request-expression";

/** Declarative body of a sync request. */
export interface IRequestDefinition<_TEntity> {
  body: Record<string, RequestExpression>;
}
