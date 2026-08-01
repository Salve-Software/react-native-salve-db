jest.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: jest.fn() },
  Platform: { OS: 'ios' },
}));

import { QueryDb } from '../QueryDb.class';
import { ConfigureDb } from '../../ConfigureDb';
import { eq } from '../../../../utils';
import type { SalveDatabase } from '../../../../specs/SalveDatabase.nitro';
import type { AnySchema } from '../../../../types';

function makeBridge() {
  return {
    configure: jest.fn(),
    execute: jest.fn().mockReturnValue({ columns: [], rows: [] }),
    beginTransaction: jest.fn(),
    commit: jest.fn(),
    rollback: jest.fn(),
    triggerSync: jest.fn().mockResolvedValue({
      operationsApplied: 0,
      inserted: 0,
      updated: 0,
      deleted: 0,
      duration: 0,
    }),
    triggerSyncAll: jest.fn(),
  } as unknown as SalveDatabase;
}

// Also registers the sync bridge (ConfigureDb.configure() calls
// registerSyncBridge(bridge) internally), which resets the shared
// throttle/in-flight state for the fresh bridge — one call per test.
function configure(bridge: SalveDatabase): void {
  new ConfigureDb(bridge).configure({ name: 'db' });
}

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

function makeSyncSchema(name: string): AnySchema {
  return {
    name,
    version: 1,
    primaryKey: 'id',
    columns: {
      id: { type: 'integer' },
      label: { type: 'text' },
    },
    sync: {
      enabled: true,
      direction: 'bidirectional',
      conflict: { strategy: 'lastWriteWins' },
      transport: 'rest',
      endpoint: { basePath: `/${name}`, sinceParam: 'updatedAfter', limitParam: 'limit' },
    },
  };
}

describe('QueryDb — write-triggered sync inside transactions', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('two writes to the same schema inside one transaction collapse into a single dispatch, deferred past commit()', async () => {
    const bridge = makeBridge();
    configure(bridge);
    const schema = makeSyncSchema('orders');

    new QueryDb(bridge).transaction((tx) => {
      tx.insert(schema).values({ id: 1, label: 'a' }).execute();
      tx.update(schema).set({ label: 'b' }).where(eq('id', 1)).execute();
    });

    // The dispatch is deferred a tick — it must not have fired yet, even
    // though the synchronous transaction body (including commit) already ran.
    expect(bridge.commit).toHaveBeenCalledTimes(1);
    expect(bridge.triggerSync).not.toHaveBeenCalled();

    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledTimes(1);
    expect(bridge.triggerSync).toHaveBeenCalledWith('orders', true);
  });

  test('writes to two different schemas inside one transaction each get their own dispatch', async () => {
    const bridge = makeBridge();
    configure(bridge);
    const orders = makeSyncSchema('orders');
    const invoices = makeSyncSchema('invoices');

    new QueryDb(bridge).transaction((tx) => {
      tx.insert(orders).values({ id: 1, label: 'a' }).execute();
      tx.insert(invoices).values({ id: 1, label: 'b' }).execute();
    });

    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledTimes(2);
    expect(bridge.triggerSync).toHaveBeenCalledWith('orders', true);
    expect(bridge.triggerSync).toHaveBeenCalledWith('invoices', true);
  });

  test('a rolled-back transaction still dispatches for a write made before the failure (accepted behavior)', async () => {
    const bridge = makeBridge();
    configure(bridge);
    const schema = makeSyncSchema('orders');

    expect(() => {
      new QueryDb(bridge).transaction((tx) => {
        tx.insert(schema).values({ id: 1, label: 'a' }).execute();
        throw new Error('boom');
      });
    }).toThrow('boom');

    expect(bridge.rollback).toHaveBeenCalledTimes(1);

    await flushMicrotasks();

    // The dispatch was already requested by the first (successful) write
    // before the later statement threw — the deferred dispatch has no way
    // to know a later statement caused a rollback. Harmless in practice:
    // triggerSync only asks the orchestrator to drain sync_queue, and the
    // native trigger's queue insert for this row rolled back in the same
    // SQLite transaction, so there's nothing stale to push.
    expect(bridge.triggerSync).toHaveBeenCalledWith('orders', true);
  });
});
