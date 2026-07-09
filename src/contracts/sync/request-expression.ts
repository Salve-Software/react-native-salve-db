/**
 * Expressão usada pra montar o body de uma {@link RequestDefinition} de
 * forma declarativa, sem JavaScript arbitrário — interpretada pelo Native
 * Sync Engine.
 */
export type RequestExpression =
  | VariableExpression
  | ConstantExpression
  | ObjectExpression
  | ArrayExpression;

/** Referencia uma variável conhecida pelo Native Sync Engine. */
export interface VariableExpression {
  $ref:
    | "cursor" // MVP
    | "operations" // MVP
    | "pageSize" // MVP — vem de PaginationDefinition.pageSize
    | "changes"
    | "deviceId"
    | "platform"
    | "timestamp"
    | "userId";
}

/** Valor literal constante. */
export interface ConstantExpression {
  value: unknown;
}

/** Objeto composto por outras {@link RequestExpression}. */
export interface ObjectExpression {
  object: Record<string, RequestExpression>;
}

/** Array composto por outras {@link RequestExpression}. */
export interface ArrayExpression {
  items: RequestExpression[];
}
