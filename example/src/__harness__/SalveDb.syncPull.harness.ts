import { describe, it, expect } from 'react-native-harness';
import { Database, eq } from '@salve-software/react-native-salve-db';
import type { AnySchema } from '@salve-software/react-native-salve-db';
import { UserSchema } from '../schemas/UserSchema';
import { SYNC_SERVER_BASE_URL } from '../library/syncServer';

function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

// SyncOrchestrator requires a configured CredentialProvider to run any sync
// session at all, even against a server that never checks auth — see
// DatabaseManager::credentials() in cpp/database/DatabaseManager.hpp.
const TEST_CREDENTIALS = {
  provider: 'oauth2' as const,
  tokens: { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' },
  refresh: {
    endpoint: '/auth/refresh',
    response: { accessToken: '$.accessToken' as const, refreshToken: '$.refreshToken' as const },
  },
};

async function configureUsers(): Promise<void> {
  Database.configure({
    name: uniqueName('e2e_sync_pull'),
    baseUrl: SYNC_SERVER_BASE_URL,
    network: { timeout: 5000 },
    credentials: TEST_CREDENTIALS,
  });
  await Database.register({ schema: UserSchema });
}

async function createOnServer(name: string, email: string): Promise<{ id: number }> {
  return fetch(`${SYNC_SERVER_BASE_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  }).then((r) => r.json()) as Promise<{ id: number }>;
}

// See SalveDb.syncPush.harness.ts's header comment — `users` is shared
// server-side across every test here, so assertions always target the
// specific row this test created, never a full list/count.
describe('Pull — real incremental GET against salve-db-server', () => {
  it('a row written directly to the server appears locally after a sync', async () => {
    await configureUsers();
    const email = `${uniqueName('gina')}@x.dev`;
    const created = await createOnServer('Gina', email);

    await Database.sync('users');

    const rows = Database.select(UserSchema).where(eq('id', created.id)).limit(10).execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.email).toBe(email);
  });

  it('pull pages incrementally — rows created across multiple pages all eventually arrive locally', async () => {
    const schema = {
      ...UserSchema,
      sync: { ...UserSchema.sync, pagination: { pageSize: 2, maxPagesPerSession: 20 } },
    } satisfies AnySchema;
    Database.configure({
      name: uniqueName('e2e_sync_pull_pages'),
      baseUrl: SYNC_SERVER_BASE_URL,
      network: { timeout: 5000 },
      credentials: TEST_CREDENTIALS,
    });
    await Database.register({ schema });

    const ids: number[] = [];
    for (let i = 0; i < 5; i++) {
      const created = await createOnServer(`Page ${i}`, `${uniqueName(`page_${i}`)}@x.dev`);
      ids.push(created.id);
    }

    await Database.sync('users');

    for (const id of ids) {
      expect(Database.select(schema).where(eq('id', id)).limit(10).execute()).toHaveLength(1);
    }
  });

  it('a row deleted directly on the server soft-deletes the local row via a pull tombstone', async () => {
    await configureUsers();
    const created = await createOnServer('Hugo', `${uniqueName('hugo')}@x.dev`);
    await Database.sync('users');
    expect(Database.select(UserSchema).where(eq('id', created.id)).limit(10).execute()).toHaveLength(1);

    await fetch(`${SYNC_SERVER_BASE_URL}/users/${created.id}`, { method: 'DELETE' });
    await Database.sync('users');

    expect(Database.select(UserSchema).where(eq('id', created.id)).limit(10).execute()).toHaveLength(0);
    const raw = Database.execute('SELECT deletedAt FROM users WHERE id = ?', [created.id]) as { deletedAt: number | null }[];
    expect(raw[0]?.deletedAt).not.toBeNull();
  });

  it('a second sync with no server-side changes is a no-op', async () => {
    await configureUsers();
    await createOnServer('Ivo', `${uniqueName('ivo')}@x.dev`);
    await Database.sync('users');

    const result = await Database.sync('users');
    expect(result.inserted).toBe(0);
    expect(result.updated).toBe(0);
    expect(result.deleted).toBe(0);
  });
});
