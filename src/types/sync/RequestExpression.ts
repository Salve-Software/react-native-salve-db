export type RequestExpression =
  | IVariableExpression
  | IConstantExpression
  | IObjectExpression
  | IArrayExpression;

/** References a variable known to the Native Sync Engine. */
export interface IVariableExpression {
  $ref:
    | "cursor"
    | "operations"
    | "pageSize"
    | "changes"
    | "deviceId"
    | "platform"
    | "timestamp"
    | "userId";
}

/** Literal constant value. */
export interface IConstantExpression {
  value: unknown;
}

/** Object composed of other {@link RequestExpression}s. */
export interface IObjectExpression {
  object: Record<string, RequestExpression>;
}

/** Array composed of other {@link RequestExpression}s. */
export interface IArrayExpression {
  items: RequestExpression[];
}
