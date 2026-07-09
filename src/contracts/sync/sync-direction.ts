/**
 * Direção do sync de um {@link SyncDefinition}.
 *
 * MVP: só `"bidirectional"` é implementada.
 */
export type SyncDirection =
  | "bidirectional" // MVP: única implementada
  | "push"
  | "pull";
