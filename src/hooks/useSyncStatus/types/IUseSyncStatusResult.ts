import type { SyncQueueStatus } from "../../../types/sync/SyncQueueStatus";

export interface IUseSyncStatusResult {
  /** `null` until the first read completes. */
  status: SyncQueueStatus | null;
  error: unknown;
  isLoading: boolean;
}
