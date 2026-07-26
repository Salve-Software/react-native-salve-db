import type { SalveDatabase } from '../../../specs/SalveDatabase.nitro';
import type { NativeSyncResult } from '../../../types/sync/NativeSyncResult';
import { ConfigureDb } from '../ConfigureDb';

export class SyncDb {
  constructor(private readonly _bridge: SalveDatabase) {}

  sync(schemaName: string): Promise<NativeSyncResult> {
    this._assertConfigured('sync');
    // discardIfBusy: false never discards, so the optional native return is
    // always present on this path — the manual API keeps its non-optional
    // contract.
    return this._bridge.triggerSync(schemaName, false) as Promise<NativeSyncResult>;
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
