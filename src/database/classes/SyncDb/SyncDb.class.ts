import type { SalveDatabase } from '../../../specs/SalveDatabase.nitro';
import type { NativeSyncResult } from '../../../types/sync/NativeSyncResult';
import { ConfigureDb } from '../ConfigureDb';

export class SyncDb {
  constructor(private readonly _bridge: SalveDatabase) {}

  sync(schemaName: string): Promise<NativeSyncResult> {
    this._assertConfigured('sync');
    return this._bridge.triggerSync(schemaName);
  }

  syncAll(): Promise<NativeSyncResult[]> {
    this._assertConfigured('syncAll');
    return this._bridge.triggerSyncAll(false);
  }

  private _assertConfigured(method: string): void {
    if (!ConfigureDb.isConfigured()) {
      throw new Error(`Database.${method}: call Database.configure() first`);
    }
  }
}
