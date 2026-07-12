import type { JsonPath } from "../../../../types";

interface OAuth2CredentialsDefinition {
  provider: 'oauth2';
  /** Where the access token travels in sync requests. @default "Authorization" */
  accessToken?: {
    headerName?: string;
  };
  /**
   * Initial token pair, obtained by the app's own login flow (out of scope
   * for this lib) before calling `configure()`. Stored natively (Keychain/
   * Keystore) and never re-read from JS afterwards — subsequent refreshes
   * are 100% native.
   */
  tokens?: {
    accessToken: string;
    refreshToken: string;
  };
  /** Triggered by the native engine on 401 — JS never participates. */
  refresh: {
    endpoint: string;
    response: {
      accessToken: JsonPath;
      refreshToken: JsonPath;
    };
  };
}

export type ICredentialsDefinition = OAuth2CredentialsDefinition;
