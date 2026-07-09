/**
 * Estratégia de resolução de conflitos de um {@link SyncDefinition}.
 *
 * MVP: só `"lastWriteWins"` é implementada.
 */
export type ConflictStrategy =
  | "lastWriteWins" // MVP: única implementada
  | "serverWins"
  | "clientWins"
  | "manual";
