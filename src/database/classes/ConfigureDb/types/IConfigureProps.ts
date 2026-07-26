import type { ICredentialsDefinition } from "./ICredentialsDefinition";

export interface IConfigureProps {
  name: string;
  baseUrl?: string;
  network?: {
    timeout: number;
  };
  credentials?: ICredentialsDefinition;
  /**
   * Enables SQLite's WAL (Write-Ahead Logging) journal mode, which reduces
   * read/write contention — readers generally keep seeing a consistent
   * snapshot while a write (e.g. the native background sync engine) is in
   * progress, instead of blocking behind its exclusive lock. Not an absolute
   * guarantee: checkpoints, schema changes, or transaction state can still
   * cause contention.
   * @default true
   */
  walMode?: boolean;
  /**
   * Automatically triggers a sync of every sync-enabled schema when the app
   * returns to the foreground.
   * @default true
   */
  syncOnAppOpen?: boolean;
  /**
   * Enables the native background sync job (WorkManager on Android,
   * BGTaskScheduler on iOS) — a single global job, not one per schema, that
   * wakes the Sync Orchestrator without starting the JS engine. Omit to
   * leave background sync disabled.
   */
  background?: {
    /**
     * Minimum interval between background sync wakes, in milliseconds.
     * Android clamps this to WorkManager's 15-minute floor; iOS treats it as
     * an `earliestBeginDate` hint — BGTaskScheduler decides the actual timing.
     */
    minimumInterval: number;
    /** Require network connectivity for the background job to run. */
    requiresNetwork?: boolean;
    /** Require the device to be charging for the background job to run. */
    requiresCharging?: boolean;
  };
}
