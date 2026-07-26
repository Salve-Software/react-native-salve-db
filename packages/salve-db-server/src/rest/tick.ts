let lastTick = 0;

/**
 * Strictly monotonic write clock, shared across every store instance in this
 * process. `Date.now()` can return the same millisecond for two consecutive
 * writes; if two rows shared a cursor key, an exclusive (`>`) cursor could
 * skip the loser of the tie at a page boundary, and an inclusive (`>=`) one
 * could re-serve it forever. Handing out a unique, always-increasing key
 * removes the whole class of bug — the database's own clock can't give this
 * guarantee, so it's enforced here instead.
 */
export function tick(): number {
  const now = Date.now();
  lastTick = now > lastTick ? now : lastTick + 1;
  return lastTick;
}
