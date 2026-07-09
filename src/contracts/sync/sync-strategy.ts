/**
 * Estratégia de sync de um {@link SyncDefinition}.
 *
 * MVP: só `"operations"` é implementada.
 */
export type SyncStrategy =
  | "operations" // MVP: única implementada
  | "incremental"
  | "full";
