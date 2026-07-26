/**
 * Deterministic JSON serialization: plain-object keys are sorted before
 * stringifying, so semantically identical values (e.g. `{ a: 1, b: 2 }` and
 * `{ b: 2, a: 1 }`) always produce the same string. `useQuery` relies on this
 * to derive a stable cache key from `deps` — a plain `JSON.stringify` would
 * treat those two objects as different queries and split the cache entry.
 *
 * Rejects values `JSON.stringify` would otherwise coerce or drop silently
 * (`NaN`/`Infinity`, `undefined`, `Map`/`Set`, `bigint`, functions) — those
 * would collapse distinct cache keys into the same string instead of failing
 * loudly.
 */
export const stableStringify = (value: unknown): string => {
  return JSON.stringify(value, (_key, val) => {
    if (typeof val === 'bigint') {
      throw new TypeError(`stableStringify: bigint values are not supported (got ${val}n) — use a string or number instead.`);
    }
    if (typeof val === 'number' && !Number.isFinite(val)) {
      throw new TypeError(`stableStringify: non-finite number ${val} is not supported.`);
    }
    if (val instanceof Map || val instanceof Set) {
      throw new TypeError(`stableStringify: ${val instanceof Map ? 'Map' : 'Set'} values are not supported — convert to a plain object or array first.`);
    }
    if (typeof val === 'function' || typeof val === 'symbol') {
      throw new TypeError(`stableStringify: ${typeof val} values are not supported.`);
    }
    if (val === undefined) {
      throw new TypeError('stableStringify: undefined is not supported — use null instead.');
    }
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
