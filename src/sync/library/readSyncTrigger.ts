import type { SalveDatabase } from '../../specs/SalveDatabase.nitro';
import { READ_SYNC_THROTTLE_MS } from '../constants';

let bridge: SalveDatabase | null = null;
const lastAttemptAt = new Map<string, number>();
const inFlight = new Set<string>();

/**
 * Wires the native bridge this module dispatches read-triggered sync
 * attempts through. Re-registering (e.g. on `Database.configure()`) clears
 * any throttle/in-flight state from a previous registration.
 */
export function registerReadSyncBridge(nextBridge: SalveDatabase): void {
  bridge = nextBridge;
  lastAttemptAt.clear();
  inFlight.clear();
}

/**
 * Fire-and-forget: attempts a read-triggered sync for `schemaName`, subject
 * to a 5s leading-edge throttle per schema and discarding (via
 * `triggerSync(schemaName, true)`) if a sync session is already running.
 * Never throws, never blocks the caller.
 */
export function requestReadSync(schemaName: string): void {
  if (bridge === null) return;
  if (inFlight.has(schemaName)) return;

  const now = Date.now();
  const last = lastAttemptAt.get(schemaName);
  if (last !== undefined && now - last < READ_SYNC_THROTTLE_MS) return;

  lastAttemptAt.set(schemaName, now);
  inFlight.add(schemaName);

  // Deferred a tick so a synchronous throw from triggerSync() becomes a rejection .catch() can still see.
  const currentBridge = bridge;
  Promise.resolve()
    .then(() => currentBridge.triggerSync(schemaName, true))
    .catch((err) => {
      console.error('Database: read-triggered sync failed', err);
    })
    .finally(() => {
      inFlight.delete(schemaName);
    });
}
