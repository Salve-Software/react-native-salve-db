jest.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: jest.fn() },
  Platform: { OS: 'ios' },
}));

import { ConfigureDb } from '../../ConfigureDb';
import { SyncDb } from '../SyncDb.class';
import type { SalveDatabase } from '../../../../specs/SalveDatabase.nitro';

function makeBridge() {
  return {
    configure: jest.fn(),
    triggerSync: jest.fn().mockResolvedValue({ operationsApplied: 0, inserted: 0, updated: 0, deleted: 0, duration: 0 }),
    triggerSyncAll: jest.fn().mockResolvedValue([]),
  } as unknown as SalveDatabase;
}

describe('SyncDb', () => {
  // Must run before any test below calls ConfigureDb#configure() — Configured
  // is a static flag shared by the whole ConfigureDb class, so once any test
  // configures it, later tests can no longer observe the unconfigured state.
  test('sync() without configure() throws synchronously, not a rejected promise', () => {
    const bridge = makeBridge();

    expect(() => new SyncDb(bridge).sync('customers')).toThrow(
      "Database.sync: call Database.configure() first"
    );
  });

  test('sync(name) calls triggerSync with that name, not triggerSyncAll', async () => {
    const bridge = makeBridge();
    new ConfigureDb(bridge).configure({ name: 'db' });

    await new SyncDb(bridge).sync('customers');

    expect(bridge.triggerSync).toHaveBeenCalledWith('customers', false);
    expect(bridge.triggerSyncAll).not.toHaveBeenCalled();
  });

  test('syncAll() calls triggerSyncAll(false), not triggerSync', async () => {
    const bridge = makeBridge();
    new ConfigureDb(bridge).configure({ name: 'db' });

    await new SyncDb(bridge).syncAll();

    expect(bridge.triggerSyncAll).toHaveBeenCalledWith(false);
    expect(bridge.triggerSync).not.toHaveBeenCalled();
  });
});
