jest.mock('react-native', () => ({
  AppState: {
    currentState: 'background',
    addEventListener: jest.fn(),
  },
}));

import { AppState } from 'react-native';
import { registerAppOpenSync } from '../registerAppOpenSync';
import type { SalveDatabase } from '../../../../../specs/SalveDatabase.nitro';

function makeBridge() {
  return {
    triggerSyncAll: jest.fn().mockResolvedValue([]),
  } as unknown as SalveDatabase;
}

function capturedHandler(): (state: string) => void {
  const addEventListener = AppState.addEventListener as jest.Mock;
  const lastCall = addEventListener.mock.calls[addEventListener.mock.calls.length - 1];
  return lastCall[1];
}

describe('registerAppOpenSync', () => {
  beforeEach(() => {
    (AppState.addEventListener as jest.Mock).mockClear();
    (AppState as { currentState: string }).currentState = 'background';
  });

  test('background -> active triggers triggerSyncAll(true) when enabled', () => {
    const bridge = makeBridge();
    registerAppOpenSync(bridge, () => true);

    capturedHandler()('active');

    expect(bridge.triggerSyncAll).toHaveBeenCalledWith(true);
  });

  test('does not trigger when disabled', () => {
    const bridge = makeBridge();
    registerAppOpenSync(bridge, () => false);

    capturedHandler()('active');

    expect(bridge.triggerSyncAll).not.toHaveBeenCalled();
  });

  test('active -> background does not trigger', () => {
    (AppState as { currentState: string }).currentState = 'active';
    const bridge = makeBridge();
    registerAppOpenSync(bridge, () => true);

    capturedHandler()('background');

    expect(bridge.triggerSyncAll).not.toHaveBeenCalled();
  });

  test('active -> active (no-op transition) does not trigger', () => {
    (AppState as { currentState: string }).currentState = 'active';
    const bridge = makeBridge();
    registerAppOpenSync(bridge, () => true);

    capturedHandler()('active');

    expect(bridge.triggerSyncAll).not.toHaveBeenCalled();
  });

  test('a rejected triggerSyncAll promise is swallowed, not thrown', async () => {
    const bridge = {
      triggerSyncAll: jest.fn().mockRejectedValue(new Error('network down')),
    } as unknown as SalveDatabase;
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});

    registerAppOpenSync(bridge, () => true);

    expect(() => capturedHandler()('active')).not.toThrow();
    await Promise.resolve();
    await Promise.resolve();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
