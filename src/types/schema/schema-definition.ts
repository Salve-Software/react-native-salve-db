import type { IColumnDefinition } from "./column-definition";
import type { IIndexDefinition } from "./index-definition";
import type { ISyncDefinition } from "../sync/sync-definition";

/** Declarative definition of a local schema (table). */
export interface ISchemaDefinition<TEntity> {
  /**
   * Unique schema name.
   *
   * E.g. `customers`
   */
  name: string;

  /** Version used for migrations. */
  version: number;

  /** Primary key. */
  primaryKey: keyof TEntity;

  /** Columns. */
  columns: Record<string, IColumnDefinition>;

  /** Indexes. */
  indexes?: IIndexDefinition[];

  /** Sync contract. */
  sync?: ISyncDefinition<TEntity>;
}
