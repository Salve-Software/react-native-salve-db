import { AppState } from 'react-native';
import type { SalveDatabase } from '../../../../specs/SalveDatabase.nitro';

let subscription: { remove: () => void } | null = null;

export function registerAppOpenSync(bridge: SalveDatabase, isEnabled: () => boolean): void {
  subscription?.remove();

  let previousState = AppState.currentState;

  subscription = AppState.addEventListener('change', (nextState) => {
    const cameToForeground = previousState !== 'active' && nextState === 'active';
    previousState = nextState;

    if (!cameToForeground || !isEnabled()) return;

    bridge.triggerSyncAll(true).catch((err) => {
      console.error('Database: automatic app-open sync failed', err);
    });
  });
}
