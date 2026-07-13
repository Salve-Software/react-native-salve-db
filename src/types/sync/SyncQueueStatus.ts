/** Snapshot of `sync_queue` state for one schema, read without running a sync. */
export interface SyncQueueStatus {
  /** Rows in `sync_queue` for this schema, awaiting the next sync session. */
  pendingCount: number;

  /** `updatedAt` of the oldest pending row (epoch millis), absent if `pendingCount` is 0. */
  oldestPendingUpdatedAt?: number;
}
