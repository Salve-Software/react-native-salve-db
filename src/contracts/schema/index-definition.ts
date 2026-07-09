/** Definição de um índice de um {@link SchemaDefinition}. */
export interface IndexDefinition {
  /** Nome único do índice. */
  name: string;

  /** Colunas cobertas pelo índice, na ordem declarada. */
  columns: string[];

  /** Se `true`, o índice tem constraint `UNIQUE`. */
  unique?: boolean;
}
