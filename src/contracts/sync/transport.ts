/**
 * Protocolo de transporte de um {@link SyncDefinition}.
 *
 * MVP: só `"rest"` é implementada.
 */
export type Transport =
  | "rest" // MVP: única implementada
  | "graphql"
  | "grpc";
