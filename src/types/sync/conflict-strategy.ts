/**
 * Conflict resolution strategy for an {@link ISyncDefinition}.
 *
 * MVP: only `"lastWriteWins"` is implemented.
 */
export type ConflictStrategy =
  | "lastWriteWins" // MVP: only one implemented
  | "serverWins"
  | "clientWins"
  | "manual";
