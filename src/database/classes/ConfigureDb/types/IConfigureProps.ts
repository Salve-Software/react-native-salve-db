import type { ICredentialsDefinition } from "./ICredentialsDefinition";

export interface IConfigureProps {
  name: string;
  baseUrl?: string;
  network?: {
    timeout: number;
  };
  credentials?: ICredentialsDefinition;
  /**
   * Enables SQLite's WAL (Write-Ahead Logging) journal mode, so reads are
   * never blocked by a concurrent write — including writes made by the
   * native background sync engine while the UI is reading via `useQuery`.
   * @default true
   */
  walMode?: boolean;
}
