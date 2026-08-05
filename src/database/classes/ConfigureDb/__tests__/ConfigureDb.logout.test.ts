jest.mock('react-native', () => ({
  AppState: { currentState: 'active', addEventListener: jest.fn() },
  Platform: { OS: 'ios' },
}));

import { ConfigureDb } from '../ConfigureDb.class';
import type { SalveDatabase } from '../../../../specs/SalveDatabase.nitro';

function makeBridge() {
  return {
    configure: jest.fn(),
    logout: jest.fn(),
  } as unknown as SalveDatabase;
}

describe('ConfigureDb.logout()', () => {
  test('calls bridge.logout()', () => {
    const bridge = makeBridge();

    new ConfigureDb(bridge).logout();

    expect(bridge.logout).toHaveBeenCalledWith();
  });

  test('propagates a synchronous bridge throw instead of swallowing it', () => {
    const bridge = makeBridge();
    (bridge.logout as jest.Mock).mockImplementation(() => {
      throw new Error('native keychain error');
    });

    expect(() => new ConfigureDb(bridge).logout()).toThrow('native keychain error');
  });

  test('does not require configure() to have run first', () => {
    const bridge = makeBridge();

    expect(() => new ConfigureDb(bridge).logout()).not.toThrow();
  });

  test('does not flip ConfigureDb.isConfigured() back to false', () => {
    const bridge = makeBridge();
    new ConfigureDb(bridge).configure({ name: 'db' });
    expect(ConfigureDb.isConfigured()).toBe(true);

    new ConfigureDb(bridge).logout();

    expect(ConfigureDb.isConfigured()).toBe(true);
  });
});
