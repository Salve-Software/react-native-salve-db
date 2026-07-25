export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: string };

export function ok<T>(value: T): ParseResult<T> {
  return { ok: true, value };
}

export function fail<T>(error: string): ParseResult<T> {
  return { ok: false, error };
}

/**
 * Narrows an unknown request body to a plain object. `express.json()` hands
 * back `undefined` for a request with no JSON `Content-Type`, so this has to
 * tolerate `unknown`, not just loosely-typed objects.
 */
export function asObject(body: unknown): Record<string, unknown> | null {
  return typeof body === 'object' && body !== null && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : null;
}

export function requireString(source: Record<string, unknown>, field: string): ParseResult<string> {
  const value = source[field];
  if (typeof value !== 'string' || value.trim() === '') {
    return fail(`${field} must be a non-empty string`);
  }
  return ok(value);
}

export function requireNumber(
  source: Record<string, unknown>,
  field: string,
  opts: { min?: number } = {}
): ParseResult<number> {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail(`${field} must be a finite number`);
  }
  if (opts.min !== undefined && value < opts.min) {
    return fail(`${field} must be >= ${opts.min}`);
  }
  return ok(value);
}

/** `undefined` (field absent) is a success carrying `undefined`; a present-but-wrong-typed field fails. */
export function optionalString(source: Record<string, unknown>, field: string): ParseResult<string | undefined> {
  if (!(field in source) || source[field] === undefined) return ok(undefined);
  return requireString(source, field);
}

/** Same absent-vs-wrong-typed distinction as {@link optionalString}. */
export function optionalNumber(
  source: Record<string, unknown>,
  field: string,
  opts: { min?: number } = {}
): ParseResult<number | undefined> {
  if (!(field in source) || source[field] === undefined) return ok(undefined);
  return requireNumber(source, field, opts);
}
