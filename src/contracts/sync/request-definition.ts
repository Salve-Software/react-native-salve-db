import type { RequestExpression } from "./request-expression";

/** Body declarativo de uma request de sync. */
export interface RequestDefinition<TEntity> {
  body: Record<string, RequestExpression>;
}
