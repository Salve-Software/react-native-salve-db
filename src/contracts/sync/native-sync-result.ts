/** Resultado de uma execução de sync retornado pelo Native Sync Engine. */
export interface NativeSyncResult {
  cursor?: string;

  operationsApplied: number;

  inserted: number;

  updated: number;

  deleted: number;

  duration: number;
}
