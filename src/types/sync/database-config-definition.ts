import type { ICredentialsDefinition } from "./credentials-definition";

/** `Database.configure()` contract. Single credential source for the MVP. */
export interface IDatabaseConfigDefinition {
  baseUrl: string;

  network?: {
    timeout: number;
  };

  /**
   * Single global app credential. No per-schema override in the MVP.
   * Future scale: becomes `Record<string, ICredentialsDefinition>` keyed by
   * provider/API, without breaking single-credential consumers.
   */
  credentials: ICredentialsDefinition;
}
