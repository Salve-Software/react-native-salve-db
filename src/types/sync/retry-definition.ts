/**
 * Out of MVP scope as a per-schema contract. MVP uses a fixed global retry,
 * hardcoded in the native engine (3 attempts, 5s delay) — no new declarative
 * key, no `IRetryDefinition` referenced in any `ISyncDefinition`. Reserved for future use.
 */
export interface IRetryDefinition {
  enabled: boolean;

  maxAttempts: number;

  backoff: "fixed" | "linear" | "exponential";

  delay: number;
}
