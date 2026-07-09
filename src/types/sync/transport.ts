/**
 * Transport protocol for an {@link ISyncDefinition}.
 *
 * MVP: only `"rest"` is implemented.
 */
export type Transport =
  | "rest" // MVP: only one implemented
  | "graphql"
  | "grpc";
