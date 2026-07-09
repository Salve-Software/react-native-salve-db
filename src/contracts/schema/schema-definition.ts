import type { ColumnDefinition } from "./column-definition";
import type { IndexDefinition } from "./index-definition";
import type { SyncDefinition } from "../sync/sync-definition";

/** Definição declarativa de um schema (tabela) local. */
export interface SchemaDefinition<TEntity> {
  /**
   * Nome único do schema.
   *
   * Ex: `customers`
   */
  name: string;

  /** Versão utilizada para migrações. */
  version: number;

  /** Primary key. */
  primaryKey: keyof TEntity;

  /** Colunas. */
  columns: Record<string, ColumnDefinition>;

  /** Índices. */
  indexes?: IndexDefinition[];

  /** Contrato de sincronização. */
  sync?: SyncDefinition<TEntity>;
}
