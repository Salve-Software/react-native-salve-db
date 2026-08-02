import React, { useEffect } from 'react';
import { describe, it, expect, render, waitFor } from 'react-native-harness';
import { Database, SalveDbProvider, useQuery } from '@salve-software/react-native-salve-db';
import type { AnySchema } from '@salve-software/react-native-salve-db';

function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/** MigrationEngine injects `deletedAt` into every schema, sync-enabled or not — a live row always carries it as `null`. */
function row(id: number): { id: number; deletedAt: null } {
  return { id, deletedAt: null };
}

describe('Database.reset — wipes local data, connection stays usable', () => {
  it('clears rows, and register() alone — no configure() — rebuilds the schema', async () => {
    Database.configure({ name: uniqueName('e2e_reset_data') });
    const schema: AnySchema = {
      name: 'reset_probe',
      version: 1,
      primaryKey: 'id',
      columns: { id: { type: 'integer' } },
    };
    await Database.register({ schema });

    Database.insert(schema).values({ id: 1 }).execute();
    Database.insert(schema).values({ id: 2 }).execute();
    expect(Database.select(schema).limit(10).execute()).toHaveLength(2);

    await Database.reset();

    // No configure() call here — the connection stays open across reset().
    await Database.register({ schema });
    expect(Database.select(schema).limit(10).execute()).toHaveLength(0);
  });

  it('empties a populated sync_queue without repropagating the deletes', async () => {
    Database.configure({ name: uniqueName('e2e_reset_queue') });
    const schema: AnySchema = {
      name: 'reset_sync_probe',
      version: 1,
      primaryKey: 'id',
      columns: {
        id: { type: 'integer' },
        updatedAt: { type: 'datetime', nullable: false },
      },
      sync: {
        enabled: true,
        direction: 'bidirectional',
        conflict: 'lastWriteWins',
        transport: 'rest',
        endpoint: { basePath: '/reset_sync_probe', sinceParam: 'updatedAfter', limitParam: 'limit' },
        pagination: { pageSize: 20, maxPagesPerSession: 20 },
      },
    };
    await Database.register({ schema });

    Database.insert(schema).values({ id: 1, updatedAt: Date.now() }).execute();
    expect(
      (Database.execute('SELECT COUNT(*) as count FROM sync_queue') as { count: number }[])[0].count
    ).toBe(1);

    await Database.reset();

    expect(
      (Database.execute('SELECT COUNT(*) as count FROM sync_queue') as { count: number }[])[0].count
    ).toBe(0);
  });
});

type UseQueryResultOf<TSchema extends AnySchema> = ReturnType<typeof useQuery<TSchema>>;

function QueryProbe<TSchema extends AnySchema>({ schema, onResult }: {
  schema: TSchema;
  onResult: (result: UseQueryResultOf<TSchema>) => void;
}) {
  const result = useQuery({ schema, queryFn: (q) => q.orderBy('id', 'asc').limit(50) });
  useEffect(() => onResult(result));
  return null;
}

describe('useQuery — reflects Database.reset() without remounting the provider', () => {
  it('a live query goes back to empty after reset() + register(), no SalveDbProvider remount', async () => {
    const schema = {
      name: uniqueName('hook_reset'),
      version: 1,
      primaryKey: 'id',
      columns: { id: { type: 'integer' } },
    } satisfies AnySchema;
    const config = { name: uniqueName('e2e_reset_reactive') };

    let latest: UseQueryResultOf<typeof schema> | undefined;

    await render(
      <SalveDbProvider config={config} schemas={[schema]}>
        <QueryProbe schema={schema} onResult={(result) => { latest = result; }} />
      </SalveDbProvider>
    );

    await waitFor(() => expect(latest?.data).toEqual([]));

    Database.insert(schema).values({ id: 1 }).execute();
    await waitFor(() => expect(latest?.data).toEqual([row(1)]));

    await Database.reset();
    await Database.register({ schema }); // no remount — the provider stays mounted

    await waitFor(() => expect(latest?.data).toEqual([]));
  });

  it('keeps reacting after reset() + configure() with the same name + register(), no remount', async () => {
    const schema = {
      name: uniqueName('hook_reset_reconfigure'),
      version: 1,
      primaryKey: 'id',
      columns: { id: { type: 'integer' } },
    } satisfies AnySchema;
    const configName = uniqueName('e2e_reset_reconfigure');

    let latest: UseQueryResultOf<typeof schema> | undefined;

    await render(
      <SalveDbProvider config={{ name: configName }} schemas={[schema]}>
        <QueryProbe schema={schema} onResult={(result) => { latest = result; }} />
      </SalveDbProvider>
    );

    await waitFor(() => expect(latest?.data).toEqual([]));

    Database.insert(schema).values({ id: 1 }).execute();
    await waitFor(() => expect(latest?.data).toEqual([row(1)]));

    await Database.reset();
    Database.configure({ name: configName }); // same name — used to silently kill this exact subscription
    await Database.register({ schema });

    await waitFor(() => expect(latest?.data).toEqual([]));

    // Proves the subscription is still alive, not just that the wipe was observed once.
    Database.insert(schema).values({ id: 2 }).execute();
    await waitFor(() => expect(latest?.data).toEqual([row(2)]));
  });
});
