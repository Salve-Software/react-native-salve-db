/** Operação individual da fila de sync (`sync_queue`), gerada por trigger. */
export interface SyncOperation {
  operation: "insert" | "update" | "delete";

  entity: string;

  primaryKey: string;

  payload: Record<string, unknown>;

  updatedAt: number;
}
