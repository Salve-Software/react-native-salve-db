import type { SalveDatabase } from '../../specs/SalveDatabase.nitro';
import { READ_SYNC_THROTTLE_MS } from '../constants';

let bridge: SalveDatabase | null = null;
let registrationToken = 0;
const lastAttemptAt = new Map<string, number>();
const inFlight = new Set<string>();

/**
 * Wires the native bridge this module dispatches sync attempts through.
 * Re-registering (e.g. on `Database.configure()`) clears any throttle/
 * in-flight state from a previous registration.
 */
export function registerSyncBridge(nextBridge: SalveDatabase): void {
  bridge = nextBridge;
  registrationToken = registrationToken + 1;
  lastAttemptAt.clear();
  inFlight.clear();
}

/**
 * Fire-and-forget: attempts a sync for `schemaName`, subject to a 5s
 * leading-edge throttle per schema and discarding (via
 * `triggerSync(schemaName, true)`) if a sync session is already running.
 * Never throws, never blocks the caller. Shared by `requestReadSync` and
 * `requestWriteSync` so a read and a write for the same schema within the
 * same window count as one throttled attempt, not two.
 */
function dispatchSync(schemaName: string): void {
  if (bridge === null) return;
  if (inFlight.has(schemaName)) return;

  const now = Date.now();
  const last = lastAttemptAt.get(schemaName);
  if (last !== undefined && now - last < READ_SYNC_THROTTLE_MS) return;

  lastAttemptAt.set(schemaName, now);
  inFlight.add(schemaName);

  // Deferred a tick so a synchronous throw from triggerSync() becomes a rejection .catch() can still see.
  const currentBridge = bridge;
  const currentToken = registrationToken;
  Promise.resolve()
    .then(() => {
      // A newer registerSyncBridge() call landed while this dispatch was
      // queued (e.g. Database.reset()+configure() in quick succession) —
      // firing against the old bridge here would race the new registration.
      if (registrationToken !== currentToken) return undefined;
      return currentBridge.triggerSync(schemaName, true);
    })
    .catch((err) => {
      console.error('Database: sync trigger failed', err);
    })
    .finally(() => {
      if (registrationToken === currentToken) inFlight.delete(schemaName);
    });
}

/** Requests a throttled sync for `schemaName` after a read. */
export function requestReadSync(schemaName: string): void {
  dispatchSync(schemaName);
}

/** Requests a throttled sync for `schemaName` after a write. */
export function requestWriteSync(schemaName: string): void {
  dispatchSync(schemaName);
}
