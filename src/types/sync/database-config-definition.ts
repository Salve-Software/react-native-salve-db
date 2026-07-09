import type { ICredentialsDefinition } from "./credentials-definition";

/** `Database.configure()` contract. Single credential source for the MVP. */
export interface IDatabaseConfigDefinition {
  /**
   * Database file name (without extension).
   * The native layer places the file in the platform documents directory:
   * iOS → NSDocumentDirectory, Android → context.filesDir.
   */
  name: string;

  /** Required when sync is used. Not needed for local-only usage. */
  baseUrl?: string;

  network?: {
    timeout: number;
  };

  /**
   * Single global app credential. No per-schema override in the MVP.
   * Required when sync is used.
   */
  credentials?: ICredentialsDefinition;
}
