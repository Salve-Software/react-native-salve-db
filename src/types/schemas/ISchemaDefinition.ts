import type { ISyncDefinition } from "../sync";
import type { IColumnDefinition } from "./IColumnDefinition";
import type { IIndexDefinition } from "./IIndexDefinition";
import type { IRelationDefinition } from "./IRelationDefinition";

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

  /** Foreign-key relations to parent schemas. */
  relations?: IRelationDefinition<TEntity>[];

  /** Sync contract. */
  sync?: ISyncDefinition<TEntity>;
}
