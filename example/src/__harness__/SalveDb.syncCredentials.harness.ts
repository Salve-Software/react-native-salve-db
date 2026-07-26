import { describe, it, expect } from 'react-native-harness';
import { Database } from '@salve-software/react-native-salve-db';
import { UserSchema } from '../schemas/UserSchema';
import { SYNC_SERVER_BASE_URL } from '../library/syncServer';

function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

// salve-db-server never checks auth (never returns 401), so a real
// 401→refresh round trip can't be exercised here — that mechanic already has
// solid C++ coverage (cpp/tests/credentials/, cpp/tests/http/CredentialHttpCallerTests.cpp,
// cpp/tests/database/HybridSalveDatabaseCredentialsTests.cpp). This covers the
// slice that's worth proving end-to-end: configuring oauth2 credentials
// stores the token natively and doesn't break a real sync request.
describe('Credentials — oauth2 configuration does not break the sync pipeline', () => {
  it('a real sync succeeds with oauth2 credentials configured', async () => {
    Database.configure({
      name: uniqueName('e2e_sync_credentials'),
      baseUrl: SYNC_SERVER_BASE_URL,
      network: { timeout: 5000 },
      credentials: {
        provider: 'oauth2',
        tokens: { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' },
        refresh: {
          endpoint: '/auth/refresh',
          response: { accessToken: '$.accessToken', refreshToken: '$.refreshToken' },
        },
      },
    });
    await Database.register({ schema: UserSchema });

    const tempId = Date.now();
    Database.insert(UserSchema).values({ id: tempId, name: 'Karen', email: `${uniqueName('karen')}@x.dev`, updatedAt: Date.now() }).execute();

    const result = await Database.sync('users');
    expect(result.updated).toBe(1);
  });
});
