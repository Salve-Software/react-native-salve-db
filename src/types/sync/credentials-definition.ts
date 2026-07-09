import type { AuthProvider } from "./auth-provider";
import type { JsonPath } from "../json-path";

/** Single global app credential (see {@link IDatabaseConfigDefinition}). */
export interface ICredentialsDefinition {
  provider: AuthProvider;

  /** Where the access token travels in sync requests. */
  accessToken: {
    /** @default "Authorization" */
    headerName?: string;
  };

  /**
   * Refresh contract. Triggered by the Native Sync Engine when a sync request
   * receives 401 — JavaScript never participates.
   */
  refresh: {
    endpoint: string;
    request: {
      refreshToken: { $ref: "refreshToken" };
    };
    response: {
      accessToken: JsonPath;
      refreshToken: JsonPath;
    };
  };
}
