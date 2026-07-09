import type { AuthProvider } from "./auth-provider";
import type { JsonPath } from "../json-path";

/** Credencial única e global do app (ver {@link DatabaseConfigDefinition}). */
export interface CredentialsDefinition {
  provider: AuthProvider;

  /** Onde o access token viaja nas requests de sync. */
  accessToken: {
    /** @default "Authorization" */
    headerName?: string;
  };

  /**
   * Contrato de refresh. Disparado pelo Native Sync Engine quando um
   * request de sync recebe 401 — JavaScript nunca participa.
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
