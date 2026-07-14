import type { IUseSyncStatusResult } from './IUseSyncStatusResult';

export interface IState {
  schemaName: string | null;
  status: IUseSyncStatusResult['status'];
  error: unknown;
}
