import React, { useEffect } from 'react';
import { describe, it, expect, render, waitFor } from 'react-native-harness';
import { Database, SalveDbProvider, eq, gte, useDatabaseReady, useQuery } from '@salve-software/react-native-salve-db';
import type { AnySchema, IDatabaseReadyState } from '@salve-software/react-native-salve-db';

function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/** `useQuery`'s row type is inferred from the schema's literal `columns` shape — keep schema objects `satisfies AnySchema`, never `: AnySchema`, or that literal shape is lost. */
type UseQueryResultOf<TSchema extends AnySchema> = ReturnType<typeof useQuery<TSchema>>;

/**
 * `react-native-harness`'s `render()` exposes no DOM/tree query API — only
 * `rerender`/`unmount`. So instead of asserting on rendered output, every
 * probe below reports the hook's return value out to a plain closure via
 * `useEffect` (fires on every render, since `useQuery`/`useDatabaseReady`
 * return a fresh object each time), and the test asserts on that captured
 * value with `waitFor`. This still exercises the real Provider mount,
 * native SQLite, and native `subscribeToChanges` push end to end.
 */
function ReadyProbe({ onState }: { onState: (state: IDatabaseReadyState) => void }) {
  const state = useDatabaseReady();
  useEffect(() => onState(state));
  return null;
}

describe('SalveDbProvider + useDatabaseReady — real async configure/register lifecycle', () => {
  it('starts loading, then flips to ready once configure/register resolve', async () => {
    const schema = {
      name: uniqueName('hook_ready'),
      version: 1,
      primaryKey: 'id',
      columns: { id: { type: 'integer' } },
    } satisfies AnySchema;

    let latest: IDatabaseReadyState | undefined;

    await render(
      <SalveDbProvider config={{ name: uniqueName('e2e_provider_ready') }} schemas={[schema]}>
        <ReadyProbe onState={(state) => { latest = state; }} />
      </SalveDbProvider>
    );

    expect(latest).toEqual({ isReady: false, isLoading: true, error: null });

    await waitFor(() => expect(latest?.isReady).toBe(true));
    expect(latest).toEqual({ isReady: true, isLoading: false, error: null });
  });

  it('surfaces a register() failure as the error state instead of throwing', async () => {
    const badSchema = {
      name: uniqueName('hook_bad'),
      version: 1,
      primaryKey: 'missing_id',
      columns: { id: { type: 'integer' } },
    } as AnySchema;

    let latest: IDatabaseReadyState | undefined;

    await render(
      <SalveDbProvider config={{ name: uniqueName('e2e_provider_error') }} schemas={[badSchema]}>
        <ReadyProbe onState={(state) => { latest = state; }} />
      </SalveDbProvider>
    );

    await waitFor(() => expect(latest?.error).not.toBeNull());
    expect(latest?.isReady).toBe(false);
    expect(latest?.isLoading).toBe(false);
    expect(String(latest?.error)).toContain("primaryKey 'missing_id' must exist in schema.columns");
  });
});

function QueryProbe<TSchema extends AnySchema>({ schema, onResult }: {
  schema: TSchema;
  onResult: (result: UseQueryResultOf<TSchema>) => void;
}) {
  const result = useQuery({ schema, queryFn: (q) => q.orderBy('id', 'asc').limit(50) });
  useEffect(() => onResult(result));
  return null;
}

describe('useQuery — real reactivity through the full native bridge', () => {
  it('picks up rows inserted from outside the component, and drops deleted ones', async () => {
    const schema = {
      name: uniqueName('hook_live'),
      version: 1,
      primaryKey: 'id',
      columns: { id: { type: 'integer' } },
    } satisfies AnySchema;
    const config = { name: uniqueName('e2e_live_query') };

    let latest: UseQueryResultOf<typeof schema> | undefined;

    await render(
      <SalveDbProvider config={config} schemas={[schema]}>
        <QueryProbe schema={schema} onResult={(result) => { latest = result; }} />
      </SalveDbProvider>
    );

    await waitFor(() => expect(latest?.data).toEqual([]));

    Database.insert(schema).values({ id: 1 }).execute();
    await waitFor(() => expect(latest?.data).toEqual([{ id: 1 }]));

    Database.insert(schema).values({ id: 2 }).execute();
    await waitFor(() => expect(latest?.data).toEqual([{ id: 1 }, { id: 2 }]));

    Database.delete(schema).where(eq('id', 1)).execute();
    await waitFor(() => expect(latest?.data).toEqual([{ id: 2 }]));
  });

  it('two components querying the same schema+deps both react to one write', async () => {
    const schema = {
      name: uniqueName('hook_shared'),
      version: 1,
      primaryKey: 'id',
      columns: { id: { type: 'integer' } },
    } satisfies AnySchema;
    const config = { name: uniqueName('e2e_shared_query') };

    let latestA: UseQueryResultOf<typeof schema> | undefined;
    let latestB: UseQueryResultOf<typeof schema> | undefined;

    await render(
      <SalveDbProvider config={config} schemas={[schema]}>
        <QueryProbe schema={schema} onResult={(result) => { latestA = result; }} />
        <QueryProbe schema={schema} onResult={(result) => { latestB = result; }} />
      </SalveDbProvider>
    );

    await waitFor(() => {
      expect(latestA?.data).toEqual([]);
      expect(latestB?.data).toEqual([]);
    });

    Database.insert(schema).values({ id: 1 }).execute();

    await waitFor(() => {
      expect(latestA?.data).toEqual([{ id: 1 }]);
      expect(latestB?.data).toEqual([{ id: 1 }]);
    });
  });
});

function FilteredQueryProbe<TSchema extends AnySchema>({ schema, minId, onResult }: {
  schema: TSchema;
  minId: number;
  onResult: (result: UseQueryResultOf<TSchema>) => void;
}) {
  const result = useQuery({
    schema,
    queryFn: (q) => q.where(gte('id', minId)).orderBy('id', 'asc').limit(50),
    deps: [minId],
  });
  useEffect(() => onResult(result));
  return null;
}

describe('useQuery — deps drive re-query, not just table writes', () => {
  it('re-runs the query with a narrower result set when deps change', async () => {
    const schema = {
      name: uniqueName('hook_deps'),
      version: 1,
      primaryKey: 'id',
      columns: { id: { type: 'integer' } },
    } satisfies AnySchema;
    const config = { name: uniqueName('e2e_deps_query') };

    let latest: UseQueryResultOf<typeof schema> | undefined;

    const { rerender } = await render(
      <SalveDbProvider config={config} schemas={[schema]}>
        <FilteredQueryProbe schema={schema} minId={1} onResult={(result) => { latest = result; }} />
      </SalveDbProvider>
    );

    await waitFor(() => expect(latest?.data).toEqual([]));

    Database.insert(schema).values({ id: 1 }).execute();
    Database.insert(schema).values({ id: 2 }).execute();
    Database.insert(schema).values({ id: 3 }).execute();
    Database.insert(schema).values({ id: 4 }).execute();

    await waitFor(() => expect(latest?.data).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]));

    await rerender(
      <SalveDbProvider config={config} schemas={[schema]}>
        <FilteredQueryProbe schema={schema} minId={3} onResult={(result) => { latest = result; }} />
      </SalveDbProvider>
    );

    await waitFor(() => expect(latest?.data).toEqual([{ id: 3 }, { id: 4 }]));
  });
});

function UnindexedWhereProbe<TSchema extends AnySchema>({ schema, onResult }: {
  schema: TSchema;
  onResult: (result: UseQueryResultOf<TSchema>) => void;
}) {
  const result = useQuery({ schema, queryFn: (q) => q.where(eq('title', 'x')).limit(10) });
  useEffect(() => onResult(result));
  return null;
}

describe('useQuery — a throwing queryFn surfaces via `error`, not a crash', () => {
  it('where() on a non-indexed column is caught and exposed as `error`, data stays null', async () => {
    const schema = {
      name: uniqueName('hook_unindexed'),
      version: 1,
      primaryKey: 'id',
      columns: {
        id: { type: 'integer' },
        title: { type: 'text' },
      },
    } satisfies AnySchema;
    const config = { name: uniqueName('e2e_unindexed_query') };

    let latest: UseQueryResultOf<typeof schema> | undefined;

    await render(
      <SalveDbProvider config={config} schemas={[schema]}>
        <UnindexedWhereProbe schema={schema} onResult={(result) => { latest = result; }} />
      </SalveDbProvider>
    );

    await waitFor(() => expect(latest?.error).not.toBeNull());
    expect(latest?.data).toBeNull();
    expect(String(latest?.error)).toContain(
      'Synchronous execute() requires an index covering column "title" as its leading column'
    );
  });
});
