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
}
