import type { JsonPath } from "../../../../types";

interface OAuth2CredentialsDefinition {
  provider: 'oauth2';
  /** Where the access token travels in sync requests. @default "Authorization" */
  accessToken?: {
    headerName?: string;
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
