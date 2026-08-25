jest.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: jest.fn() },
  Platform: { OS: 'ios' },
}));

import { ConfigureDb } from '../ConfigureDb.class';
import type { SalveDatabase } from '../../../../specs/SalveDatabase.nitro';

function makeBridge() {
  return {
    configure: jest.fn(),
    reset: jest.fn().mockResolvedValue(undefined),
  } as unknown as SalveDatabase;
}

describe('ConfigureDb.reset()', () => {
  test('calls bridge.reset() and forwards its resolved value', async () => {
    const bridge = makeBridge();

    await expect(new ConfigureDb(bridge).reset()).resolves.toBeUndefined();

    expect(bridge.reset).toHaveBeenCalledWith();
  });

  test('propagates a bridge rejection instead of swallowing it', async () => {
    const bridge = makeBridge();
    (bridge.reset as jest.Mock).mockRejectedValue(new Error('native wipe failed'));

    await expect(new ConfigureDb(bridge).reset()).rejects.toThrow('native wipe failed');
  });

  test('does not throw synchronously when configure() was never called', () => {
    const bridge = makeBridge();

    expect(() => new ConfigureDb(bridge).reset()).not.toThrow();
  });

  test('does not flip ConfigureDb.isConfigured() back to false', async () => {
    const bridge = makeBridge();
    new ConfigureDb(bridge).configure({ name: 'db' });
    expect(ConfigureDb.isConfigured()).toBe(true);

    await new ConfigureDb(bridge).reset();

    expect(ConfigureDb.isConfigured()).toBe(true);
  });
});
