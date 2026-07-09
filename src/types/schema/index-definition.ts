/** Index definition inside an {@link ISchemaDefinition}. */
export interface IIndexDefinition {
  /** Unique index name. */
  name: string;

  /** Columns covered by the index, in declaration order. */
  columns: string[];

  /** If `true`, the index has a `UNIQUE` constraint. */
  unique?: boolean;
}
