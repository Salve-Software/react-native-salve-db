import type { ICredentialsDefinition } from '../types';
import type { ConfigureParams } from '../../../../specs/types/ConfigureParams';

export function mapCredentials(creds: ICredentialsDefinition): ConfigureParams['credentials'] {
  switch (creds.provider) {
    case 'oauth2':
      return {
        provider: creds.provider,
        accessTokenHeaderName: creds.accessToken?.headerName ?? 'Authorization',
        accessTokenScheme: creds.accessToken?.scheme ?? 'Bearer',
        tokens: creds.tokens,
        refresh: {
          endpoint: creds.refresh.endpoint,
          responseAccessTokenPath: creds.refresh.response.accessToken,
          responseRefreshTokenPath: creds.refresh.response.refreshToken,
        },
      };
  }
}
