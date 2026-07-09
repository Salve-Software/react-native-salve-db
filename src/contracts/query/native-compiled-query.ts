import type { CompiledQuery } from './compiled-query'

/**
 * Query shape used at the JSI boundary.
 *
 * `params` is JSON-serialized before crossing into native to avoid marshaling
 * a heterogeneous `unknown[]` array via JSI. The native side parses it back
 * to a typed `std::vector<SQLiteValue>`.
 *
 * @see {@linkcode CompiledQuery} — public query contract (pre-serialization shape)
 */
export interface NativeCompiledQuery {
  sql: string
  paramsJson: string
}
