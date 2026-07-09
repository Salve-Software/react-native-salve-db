/**
 * Fora do MVP como contrato por-schema. MVP usa retry fixo e global,
 * hardcoded no native engine (3 tentativas, 5s delay) — sem chave
 * declarativa nova, sem `RetryDefinition` referenciado em nenhum
 * `SyncDefinition`. Este tipo fica reservado.
 */
export interface RetryDefinition {
  enabled: boolean;

  maxAttempts: number;

  backoff: "fixed" | "linear" | "exponential";

  delay: number;
}
