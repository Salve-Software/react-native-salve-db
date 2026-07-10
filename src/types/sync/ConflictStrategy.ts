/**
 * Conflict resolution strategy
 */
export type ConflictStrategy =
  | "lastWriteWins"
  | "serverWins"
  | "clientWins"
  | "manual";
