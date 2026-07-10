interface NetworkParams {
  /** Request timeout in milliseconds. */
  timeout: number;
}

interface RefreshParams {
  /** Endpoint called by the native engine when a sync request receives 401. */
  endpoint: string;
  /** JsonPath to extract the new access token from the refresh response (e.g. `$.access_token`). */
  responseAccessTokenPath: string;
  /** JsonPath to extract the new refresh token from the refresh response (e.g. `$.refresh_token`). */
  responseRefreshTokenPath: string;
}

interface CredentialsParams {
  /** Auth provider. Determines how the native engine authenticates sync requests. */
  provider: string;
  /** Header used to send the access token in sync requests (e.g. `"Authorization"`). */
  accessTokenHeaderName: string;
  /** Token refresh contract. Executed natively on 401 — JS never participates. */
  refresh: RefreshParams;
}

export interface ConfigureParams {
  /** SQLite file name (without extension). The native layer places it in the platform documents directory. */
  name: string;
  /** Base URL of the sync server (e.g. `"https://api.myapp.com"`). Required when sync is used. */
  baseUrl?: string;
  /** Network settings applied to all sync requests. */
  network?: NetworkParams;
  /** Global auth credentials. Required when sync is used. */
  credentials?: CredentialsParams;
}
