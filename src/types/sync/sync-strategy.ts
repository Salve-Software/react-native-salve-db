/**
 * Sync strategy for an {@link ISyncDefinition}.
 *
 * MVP: only `"operations"` is implemented.
 */
export type SyncStrategy =
  | "operations" // MVP: only one implemented
  | "incremental"
  | "full";
