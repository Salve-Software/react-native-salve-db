import React, { useEffect } from 'react';
import { describe, it, expect, render, waitFor } from 'react-native-harness';
import { SalveDbProvider, useQuery } from '@salve-software/react-native-salve-db';
import { UserSchema } from '../schemas/UserSchema';
import { SYNC_SERVER_BASE_URL } from '../library/syncServer';

function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

async function createOnServer(name: string, email: string): Promise<{ id: number }> {
  return fetch(`${SYNC_SERVER_BASE_URL}/users`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, email }),
  }).then((r) => r.json()) as Promise<{ id: number }>;
}

// See SalveDb.hooks.harness.tsx's header comment on why probes report out via
// useEffect instead of asserting on rendered output.
function QueryProbe({ onData }: { onData: (rows: unknown[] | null) => void }) {
  const { data } = useQuery({ schema: UserSchema, queryFn: (q) => q.orderBy('id', 'asc').limit(50) });
  useEffect(() => onData(data));
  return null;
}

function hasId(rows: unknown[] | null, id: number): boolean {
  return (rows ?? []).some((row) => (row as { id: number }).id === id);
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

describe('Read-flow cache-first — useQuery triggers a background sync on read (#85)', () => {
  it('a row written directly to the server appears locally without ever calling Database.sync() manually', async () => {
    const config = { name: uniqueName('e2e_read_flow'), baseUrl: SYNC_SERVER_BASE_URL, network: { timeout: 5000 }, credentials: TEST_CREDENTIALS };
    const created = await createOnServer('Leo', `${uniqueName('leo')}@x.dev`);

    let latest: unknown[] | null = null;
    await render(
      <SalveDbProvider config={config} schemas={[UserSchema]}>
        <QueryProbe onData={(rows) => { latest = rows; }} />
      </SalveDbProvider>
    );

    // No Database.sync() call anywhere in this test — mounting useQuery on a
    // sync-enabled schema is what triggers the background pull.
    await waitFor(() => expect(hasId(latest, created.id)).toBe(true), 10000);
  });

  it('a second read within the 5s throttle window does not trigger a second sync', async () => {
    const config = { name: uniqueName('e2e_read_flow_throttle'), baseUrl: SYNC_SERVER_BASE_URL, network: { timeout: 5000 }, credentials: TEST_CREDENTIALS };

    // SalveDbProvider stays mounted for the whole test — its effect calls
    // Database.configure(), which resets the read-sync throttle map on every
    // call (by design, for a later app launch re-configuring). Remounting the
    // provider itself would defeat the throttle test below, so only the
    // QueryProbe child is toggled off/on via rerender() to force useQuery's
    // effect to fire again without touching configure().
    let latest: unknown[] | null = null;
    const probe = await render(
      <SalveDbProvider config={config} schemas={[UserSchema]}>
        <QueryProbe onData={(rows) => { latest = rows; }} />
      </SalveDbProvider>
    );
    await waitFor(() => expect(latest).not.toBeNull(), 10000);

    // Write directly to the server right after the first read's sync already ran.
    const created = await createOnServer('Mara', `${uniqueName('mara')}@x.dev`);

    // Remount just the probe, well inside the 5s throttle window (READ_SYNC_THROTTLE_MS).
    await probe.rerender(<SalveDbProvider config={config} schemas={[UserSchema]}>{null}</SalveDbProvider>);
    await probe.rerender(
      <SalveDbProvider config={config} schemas={[UserSchema]}>
        <QueryProbe onData={(rows) => { latest = rows; }} />
      </SalveDbProvider>
    );
    // Give a throttled/discarded read-sync attempt time to no-op — this
    // waits out real time on purpose (proving the throttle *didn't* fire),
    // not polling for a state change, so a plain delay is the right tool here.
    await new Promise<void>((resolve) => setTimeout(resolve, 1000));
    expect(hasId(latest, created.id)).toBe(false);

    // Wait past the throttle window, then read again — now it must sync and appear.
    await new Promise<void>((resolve) => setTimeout(resolve, 4500));
    await probe.rerender(<SalveDbProvider config={config} schemas={[UserSchema]}>{null}</SalveDbProvider>);
    await probe.rerender(
      <SalveDbProvider config={config} schemas={[UserSchema]}>
        <QueryProbe onData={(rows) => { latest = rows; }} />
      </SalveDbProvider>
    );
    await waitFor(() => expect(hasId(latest, created.id)).toBe(true), 10000);
  });
});
