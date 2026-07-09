/** Out of MVP scope. Not referenced in any `ISyncDefinition` yet. */
export interface ICompressionDefinition {
  enabled: boolean;

  algorithm: "gzip" | "brotli";
}
