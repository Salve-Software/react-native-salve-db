/** Formats an integer amount of cents (Salve DB's `balanceCents` column) as a `$0.00`-style label. */
export function formatCurrency(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
