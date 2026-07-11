/**
 * Deterministic JSON serialization: plain-object keys are sorted before
 * stringifying, so semantically identical values (e.g. `{ a: 1, b: 2 }` and
 * `{ b: 2, a: 1 }`) always produce the same string. `useQuery` relies on this
 * to derive a stable cache key from `deps` — a plain `JSON.stringify` would
 * treat those two objects as different queries and split the cache entry.
 *
 */
export const stableStringify = (value: unknown): string => {
  return JSON.stringify(value, (_key, val) => {
    if (isPlainObject(val)) {
      return Object.keys(val).sort().reduce((sorted, key) => {
        sorted[key] = val[key];
        return sorted;
      }, {} as Record<string, unknown>);
    }

    return val;
  });
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (Object.prototype.toString.call(value) !== '[object Object]') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === null || prototype === Object.prototype;
}
