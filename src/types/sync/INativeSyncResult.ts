/** Result of a sync run returned by the Native Sync Engine. */
export interface INativeSyncResult {
  cursor?: string;
  operationsApplied: number;
  inserted: number;
  updated: number;
  deleted: number;
  duration: number;
}
