import { describe, it, expect } from 'react-native-harness';
import { Database, eq } from '@salve-software/react-native-salve-db';
import { UserSchema } from '../schemas/UserSchema';
import { SYNC_SERVER_BASE_URL } from '../library/syncServer';

function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

async function configureUsers(): Promise<void> {
  Database.configure({
    name: uniqueName('e2e_sync_push'),
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
}

// packages/salve-db-server's `users` table is shared across every test in this
// file (not reset per test — see the harness plan's "no fresh table per test
// on the server" note), so assertions here always target the specific row
// this test created, never a full list/count.
describe('Push — real POST/PATCH/DELETE against salve-db-server', () => {
  it('a local insert pushes a real POST and rewrites the local id to the server-assigned one', async () => {
    await configureUsers();
    const tempId = Date.now();
    const email = `${uniqueName('ana')}@x.dev`;

    Database.insert(UserSchema).values({ id: tempId, name: 'Ana', email, updatedAt: Date.now() }).execute();
    const result = await Database.sync('users');

    expect(result.updated).toBe(1);
    expect(Database.select(UserSchema).where(eq('id', tempId)).limit(10).execute()).toHaveLength(0);

    const queue = Database.execute('SELECT COUNT(*) as count FROM sync_queue WHERE entity = ?', ['users']) as { count: number }[];
    expect(queue[0]!.count).toBe(0);

    const metadata = Database.execute(
      'SELECT status, remoteId FROM _salve_sync_metadata WHERE tableName = ? AND localId = ?',
      ['users', String(tempId)]
    ) as { status: string; remoteId: string }[];
    expect(metadata[0]?.status).toBe('SYNCED');
    expect(metadata[0]?.remoteId).not.toBe(String(tempId));
  });

  it('an update on an already-synced row pushes a real PATCH', async () => {
    await configureUsers();
    const tempId = Date.now();
    const email = `${uniqueName('bruno')}@x.dev`;
    Database.insert(UserSchema).values({ id: tempId, name: 'Bruno', email, updatedAt: Date.now() }).execute();
    await Database.sync('users');

    const [synced] = Database.select(UserSchema).where(eq('email', email)).limit(1).execute();
    Database.update(UserSchema).set({ name: 'Bruno Silva' }).where(eq('id', synced!.id)).execute();
    const result = await Database.sync('users');

    expect(result.updated).toBe(1);
    const serverRow = await fetch(`${SYNC_SERVER_BASE_URL}/users/${synced!.id}`).then((r) => r.json()) as { name: string };
    expect(serverRow.name).toBe('Bruno Silva');
  });

  it('a local soft delete pushes a real DELETE and confirms locally with syncedAt', async () => {
    await configureUsers();
    const tempId = Date.now();
    const email = `${uniqueName('caio')}@x.dev`;
    Database.insert(UserSchema).values({ id: tempId, name: 'Caio', email, updatedAt: Date.now() }).execute();
    await Database.sync('users');

    const [synced] = Database.select(UserSchema).where(eq('email', email)).limit(1).execute();
    Database.delete(UserSchema).where(eq('id', synced!.id)).execute();
    const result = await Database.sync('users');

    // >= 1, not ===: the pull phase in the same session can also tombstone
    // rows deleted by earlier tests on the shared server table (fresh local
    // db here means cursor 0, so it pulls the server's full delete history).
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    const metadata = Database.execute(
      'SELECT status, syncedAt FROM _salve_sync_metadata WHERE tableName = ? AND entityId = ?',
      ['users', String(synced!.id)]
    ) as { status: string; syncedAt: number | null }[];
    expect(metadata[0]?.status).toBe('DELETED');
    expect(metadata[0]?.syncedAt).not.toBeNull();

    const serverResponse = await fetch(`${SYNC_SERVER_BASE_URL}/users/${synced!.id}`);
    expect(serverResponse.status).toBe(404);
  });

  it('a DELETE the server already 404s on (deleted outside the app) is treated as idempotent success (L2)', async () => {
    await configureUsers();
    const tempId = Date.now();
    const email = `${uniqueName('duda')}@x.dev`;
    Database.insert(UserSchema).values({ id: tempId, name: 'Duda', email, updatedAt: Date.now() }).execute();
    await Database.sync('users');

    const [synced] = Database.select(UserSchema).where(eq('email', email)).limit(1).execute();
    await fetch(`${SYNC_SERVER_BASE_URL}/users/${synced!.id}`, { method: 'DELETE' });

    Database.delete(UserSchema).where(eq('id', synced!.id)).execute();
    const result = await Database.sync('users');

    // >= 1, not ===: the pull phase in the same session can also tombstone
    // rows deleted by earlier tests on the shared server table (fresh local
    // db here means cursor 0, so it pulls the server's full delete history).
    expect(result.deleted).toBeGreaterThanOrEqual(1);
    const metadata = Database.execute(
      'SELECT status FROM _salve_sync_metadata WHERE tableName = ? AND entityId = ?',
      ['users', String(synced!.id)]
    ) as { status: string }[];
    expect(metadata[0]?.status).toBe('DELETED');
    const queue = Database.execute('SELECT COUNT(*) as count FROM sync_queue WHERE entity = ?', ['users']) as { count: number }[];
    expect(queue[0]!.count).toBe(0);
  });

  it('a PATCH the server 404s on (deleted outside the app) stops auto-retry instead of failing forever (L2)', async () => {
    await configureUsers();
    const tempId = Date.now();
    const email = `${uniqueName('elis')}@x.dev`;
    Database.insert(UserSchema).values({ id: tempId, name: 'Elis', email, updatedAt: Date.now() }).execute();
    await Database.sync('users');

    const [synced] = Database.select(UserSchema).where(eq('email', email)).limit(1).execute();
    await fetch(`${SYNC_SERVER_BASE_URL}/users/${synced!.id}`, { method: 'DELETE' });

    Database.update(UserSchema).set({ name: 'Elis Regina' }).where(eq('id', synced!.id)).execute();
    await Database.sync('users');

    const queueRow = Database.execute(
      'SELECT status FROM sync_queue WHERE entity = ? AND entity_id = ?',
      ['users', String(synced!.id)]
    ) as { status: string }[];
    expect(queueRow[0]?.status).toBe('BLOCKED');

    // A blocked item is excluded from the next sync's retry — status stays BLOCKED, not FAILED.
    await Database.sync('users');
    const queueRowAfter = Database.execute(
      'SELECT status FROM sync_queue WHERE entity = ? AND entity_id = ?',
      ['users', String(synced!.id)]
    ) as { status: string }[];
    expect(queueRowAfter[0]?.status).toBe('BLOCKED');
  });

  it('a POST response colliding with another already-synced row does not crash the session or duplicate on retry', async () => {
    await configureUsers();

    // The server's id sequence never reuses ids and harness tests run
    // serially — a throwaway probe row tells us exactly what id the next
    // real create will receive.
    const probe = await fetch(`${SYNC_SERVER_BASE_URL}/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'probe', email: 'probe@x.dev' }),
    }).then((r) => r.json()) as { id: number };
    await fetch(`${SYNC_SERVER_BASE_URL}/users/${probe.id}`, { method: 'DELETE' });
    const collidingId = probe.id + 1;

    // Plant a local row already claiming that id as an unrelated, already-synced entity.
    const now = Date.now();
    Database.execute('INSERT INTO users (id, name, email, updatedAt) VALUES (?, ?, ?, ?)', [collidingId, 'existing', 'existing@x.dev', now]);
    Database.execute('DELETE FROM sync_queue WHERE entity = ? AND entity_id = ?', ['users', String(collidingId)]);
    Database.execute(
      "UPDATE _salve_sync_metadata SET status = 'SYNCED', remoteId = ?, syncedAt = ? WHERE tableName = 'users' AND localId = ?",
      [String(collidingId), now, String(collidingId)]
    );

    // Push a genuinely new item — the server assigns it exactly `collidingId`.
    const tempId = Date.now() + 1;
    Database.insert(UserSchema).values({ id: tempId, name: 'Fabio', email: `${uniqueName('fabio')}@x.dev`, updatedAt: Date.now() }).execute();

    let syncError: unknown;
    try {
      await Database.sync('users');
    } catch (error) {
      syncError = error;
    }
    expect(syncError).toBeUndefined();

    const queueRow = Database.execute(
      'SELECT status FROM sync_queue WHERE entity = ? AND entity_id = ?',
      ['users', String(tempId)]
    ) as { status: string }[];
    expect(queueRow[0]?.status).toBe('BLOCKED');

    await Database.sync('users');
    const queueRowAfter = Database.execute(
      'SELECT status FROM sync_queue WHERE entity = ? AND entity_id = ?',
      ['users', String(tempId)]
    ) as { status: string }[];
    expect(queueRowAfter[0]?.status).toBe('BLOCKED');
  });
});
