import { mapCredentials } from '../mapCredentials';
import type { ICredentialsDefinition } from '../../types';

describe('mapCredentials', () => {
  test('maps oauth2 credentials, defaulting accessTokenHeaderName to Authorization and accessTokenScheme to Bearer', () => {
    const creds: ICredentialsDefinition = {
      provider: 'oauth2',
      tokens: { accessToken: 'access', refreshToken: 'refresh' },
      refresh: {
        endpoint: '/auth/refresh',
        response: { accessToken: '$.accessToken', refreshToken: '$.refreshToken' },
      },
    };

    expect(mapCredentials(creds)).toEqual({
      provider: 'oauth2',
      accessTokenHeaderName: 'Authorization',
      accessTokenScheme: 'Bearer',
      tokens: { accessToken: 'access', refreshToken: 'refresh' },
      refresh: {
        endpoint: '/auth/refresh',
        responseAccessTokenPath: '$.accessToken',
        responseRefreshTokenPath: '$.refreshToken',
      },
    });
  });

  test('honors a custom accessToken.headerName', () => {
    const creds: ICredentialsDefinition = {
      provider: 'oauth2',
      accessToken: { headerName: 'X-Api-Token' },
      refresh: {
        endpoint: '/auth/refresh',
        response: { accessToken: '$.accessToken', refreshToken: '$.refreshToken' },
      },
    };

    expect(mapCredentials(creds)?.accessTokenHeaderName).toBe('X-Api-Token');
  });

  test('honors a custom accessToken.scheme', () => {
    const creds: ICredentialsDefinition = {
      provider: 'oauth2',
      accessToken: { scheme: 'Token' },
      refresh: {
        endpoint: '/auth/refresh',
        response: { accessToken: '$.accessToken', refreshToken: '$.refreshToken' },
      },
    };

    expect(mapCredentials(creds)?.accessTokenScheme).toBe('Token');
  });

  test('honors an empty accessToken.scheme for APIs expecting the raw token with no prefix', () => {
    const creds: ICredentialsDefinition = {
      provider: 'oauth2',
      accessToken: { scheme: '' },
      refresh: {
        endpoint: '/auth/refresh',
        response: { accessToken: '$.accessToken', refreshToken: '$.refreshToken' },
      },
    };

    expect(mapCredentials(creds)?.accessTokenScheme).toBe('');
  });
});
