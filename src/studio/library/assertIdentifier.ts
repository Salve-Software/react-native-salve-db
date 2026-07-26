const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Guards against SQL injection through table/column names, which can't be parametrized like values. */
export function assertIdentifier(name: string | undefined, label: string): asserts name is string {
  if (!name || !IDENTIFIER_PATTERN.test(name)) {
    throw new Error(`Studio: invalid ${label} "${String(name)}"`);
  }
}
