import { registerSyncBridge, requestReadSync, requestWriteSync } from '../syncTrigger';
import type { SalveDatabase } from '../../../specs/SalveDatabase.nitro';

function makeBridge() {
  return {
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

// requestReadSync now dispatches a tick later — drain a few microtask ticks before asserting.
async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 5; i++) await Promise.resolve();
}

describe('syncTrigger', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // Must run before any other test registers a bridge — it verifies the
  // pre-`Database.configure()` guard, when the module's bridge is still null.
  test('before any bridge is registered, requestReadSync does not throw and calls nothing', () => {
    expect(() => requestReadSync('customers')).not.toThrow();
  });

  test('first call for a schema triggers triggerSync(schemaName, true)', async () => {
    const bridge = makeBridge();
    registerSyncBridge(bridge);

    requestReadSync('customers');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledWith('customers', true);
    expect(bridge.triggerSyncAll).not.toHaveBeenCalled();
  });

  test('a second call for the same schema within the 5s window does not trigger again', async () => {
    const bridge = makeBridge();
    registerSyncBridge(bridge);

    requestReadSync('customers');
    requestReadSync('customers');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledTimes(1);
  });

  test('a call at 4999ms still does not trigger again', async () => {
    const bridge = makeBridge();
    registerSyncBridge(bridge);

    requestReadSync('customers');
    jest.setSystemTime(4999);
    requestReadSync('customers');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledTimes(1);
  });

  test('a call at 5000ms (after the previous attempt resolved) triggers again', async () => {
    const bridge = makeBridge();
    registerSyncBridge(bridge);

    requestReadSync('customers');
    await flushMicrotasks();

    jest.setSystemTime(5000);
    requestReadSync('customers');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledTimes(2);
  });

  test('schemas have independent throttle windows', async () => {
    const bridge = makeBridge();
    registerSyncBridge(bridge);

    requestReadSync('a');
    requestReadSync('b');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenNthCalledWith(1, 'a', true);
    expect(bridge.triggerSync).toHaveBeenNthCalledWith(2, 'b', true);
  });

  test('a call while the previous attempt is still in flight is discarded, even outside the throttle window', async () => {
    const bridge = {
      triggerSync: jest.fn().mockReturnValue(new Promise(() => {})), // never resolves
      triggerSyncAll: jest.fn(),
    } as unknown as SalveDatabase;
    registerSyncBridge(bridge);

    requestReadSync('customers');
    jest.setSystemTime(10000);
    requestReadSync('customers');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledTimes(1);
  });

  test('inFlight is released once the attempt settles, allowing a later call to trigger again', async () => {
    const bridge = makeBridge();
    registerSyncBridge(bridge);

    requestReadSync('customers');
    await flushMicrotasks();

    jest.setSystemTime(5000);
    requestReadSync('customers');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledTimes(2);
  });

  test('a native discard (undefined) does not open the window early', async () => {
    const bridge = {
      triggerSync: jest.fn().mockResolvedValue(undefined),
      triggerSyncAll: jest.fn(),
    } as unknown as SalveDatabase;
    registerSyncBridge(bridge);

    requestReadSync('customers');
    await flushMicrotasks();

    jest.setSystemTime(4999);
    requestReadSync('customers');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledTimes(1);
  });

  test('a rejected triggerSync promise is swallowed, not thrown, and logged', async () => {
    const bridge = {
      triggerSync: jest.fn().mockRejectedValue(new Error('network down')),
      triggerSyncAll: jest.fn(),
    } as unknown as SalveDatabase;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    registerSyncBridge(bridge);

    expect(() => requestReadSync('customers')).not.toThrow();
    await flushMicrotasks();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  test('a synchronous throw from triggerSync() is caught, not left uncaught, and inFlight is still released', async () => {
    const bridge = {
      triggerSync: jest.fn().mockImplementation(() => {
        throw new Error('marshaling failed');
      }),
      triggerSyncAll: jest.fn(),
    } as unknown as SalveDatabase;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
    registerSyncBridge(bridge);

    expect(() => requestReadSync('customers')).not.toThrow();
    await flushMicrotasks();

    expect(consoleError).toHaveBeenCalled();

    // inFlight must have been released despite the synchronous throw, or
    // this schema would be stuck forever.
    jest.setSystemTime(5000);
    requestReadSync('customers');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledTimes(2);
    consoleError.mockRestore();
  });

  test('registering a new bridge clears throttle and in-flight state from a previous registration', async () => {
    const first = makeBridge();
    registerSyncBridge(first);
    requestReadSync('customers'); // marks 'customers' as attempted at t=0

    const second = makeBridge();
    registerSyncBridge(second); // should clear the throttle window

    requestReadSync('customers'); // would be discarded by the old window if not cleared
    await flushMicrotasks();

    expect(second.triggerSync).toHaveBeenCalledWith('customers', true);
  });
});

describe('requestWriteSync — shared dispatch with requestReadSync', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(0);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('first call for a schema triggers triggerSync(schemaName, true)', async () => {
    const bridge = makeBridge();
    registerSyncBridge(bridge);

    requestWriteSync('customers');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledWith('customers', true);
  });

  test('a write shares the throttle window opened by a prior read for the same schema', async () => {
    const bridge = makeBridge();
    registerSyncBridge(bridge);

    requestReadSync('customers');
    requestWriteSync('customers');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledTimes(1);
  });

  test('a read shares the throttle window opened by a prior write for the same schema', async () => {
    const bridge = makeBridge();
    registerSyncBridge(bridge);

    requestWriteSync('customers');
    requestReadSync('customers');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledTimes(1);
  });

  test('an in-flight read discards a write for the same schema, even outside the throttle window', async () => {
    const bridge = {
      triggerSync: jest.fn().mockReturnValue(new Promise(() => {})), // never resolves
      triggerSyncAll: jest.fn(),
    } as unknown as SalveDatabase;
    registerSyncBridge(bridge);

    requestReadSync('customers');
    jest.setSystemTime(10000);
    requestWriteSync('customers');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenCalledTimes(1);
  });

  test('independent schemas stay isolated when mixing read and write calls', async () => {
    const bridge = makeBridge();
    registerSyncBridge(bridge);

    requestReadSync('a');
    requestWriteSync('b');
    await flushMicrotasks();

    expect(bridge.triggerSync).toHaveBeenNthCalledWith(1, 'a', true);
    expect(bridge.triggerSync).toHaveBeenNthCalledWith(2, 'b', true);
  });

  test('registering a new bridge clears throttle state built up from mixed read/write calls', async () => {
    const first = makeBridge();
    registerSyncBridge(first);
    requestReadSync('customers');
    requestWriteSync('customers'); // discarded by the read's in-flight window under `first`

    const second = makeBridge();
    registerSyncBridge(second);

    requestWriteSync('customers'); // would be discarded by the old window if not cleared
    await flushMicrotasks();

    expect(second.triggerSync).toHaveBeenCalledWith('customers', true);
  });
});
