import { describe, it, expect } from 'react-native-harness';
import { Database, eq } from '@salve-software/react-native-salve-db';
import type { AnySchema } from '@salve-software/react-native-salve-db';
import { UserSchema } from '../schemas/UserSchema';
import { SYNC_SERVER_BASE_URL } from '../library/syncServer';

function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

describe('Relations — FK cascade when a parent local id is replaced by the server-assigned one', () => {
  it("a child row's FK follows the parent's id rewrite through a real push", async () => {
    Database.configure({
      name: uniqueName('e2e_sync_relations'),
      baseUrl: SYNC_SERVER_BASE_URL,
      network: { timeout: 5000 },
      // SyncOrchestrator requires a configured CredentialProvider to run any
      // sync session at all, even against a server that never checks auth —
      // see DatabaseManager::credentials() in cpp/database/DatabaseManager.hpp.
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

    const orderSchema = {
      name: uniqueName('orders'),
      version: 1,
      primaryKey: 'id',
      columns: {
        id: { type: 'integer' },
        customerId: { type: 'integer' },
        updatedAt: { type: 'datetime', nullable: false },
      },
      relations: [{ column: 'customerId', references: 'users' }],
    } satisfies AnySchema;
    await Database.register({ schema: orderSchema });

    const tempCustomerId = Date.now();
    const email = `${uniqueName('julia')}@x.dev`;
    Database.insert(UserSchema).values({ id: tempCustomerId, name: 'Julia', email, updatedAt: Date.now() }).execute();
    Database.insert(orderSchema).values({ id: 1, customerId: tempCustomerId, updatedAt: Date.now() }).execute();

    await Database.sync('users');

    const [user] = Database.select(UserSchema).where(eq('email', email)).limit(1).execute();
    expect(user?.id).not.toBe(tempCustomerId);

    const [order] = Database.select(orderSchema).where(eq('id', 1)).limit(1).execute();
    expect(order?.customerId).toBe(user?.id);
  });
});
