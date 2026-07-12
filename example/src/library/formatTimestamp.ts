/** Formats an epoch-millis timestamp (Salve DB's `datetime` column type) as a short relative/absolute label. */
export function formatTimestamp(epochMillis: number): string {
  const diffMs = Date.now() - epochMillis;
  const diffMinutes = Math.round(diffMs / 60_000);

  if (diffMinutes < 1) return 'just now';
  if (diffMinutes < 60) return `${diffMinutes}m ago`;

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}h ago`;

  return new Date(epochMillis).toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}
