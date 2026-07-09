/**
 * Sync direction for an {@link ISyncDefinition}.
 *
 * MVP: only `"bidirectional"` is implemented.
 */
export type SyncDirection =
  | "bidirectional" // MVP: only one implemented
  | "push"
  | "pull";
