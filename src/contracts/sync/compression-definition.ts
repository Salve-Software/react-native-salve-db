/** Fora do MVP. Não referenciado em nenhum `SyncDefinition` ainda. */
export interface CompressionDefinition {
  enabled: boolean;

  algorithm: "gzip" | "brotli";
}
