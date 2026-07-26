import type { IResourceBase, IResourceStore, IListQuery, ResourceRow, WritableFields } from './types';
import { tick } from './tick';

/**
 * Minimal structural contract both `pg.Pool` and `@electric-sql/pglite`'s
 * `PGlite` satisfy without either type being imported here — keeps the
 * test-only PGlite dependency out of production code.
 */
export interface QueryExecutor {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface PostgresResourceStoreConfig {
  table: string;
  /** Writable column names, in the exact order bound to `$1..$n` on create. */
  columns: string[];
}

function quoteIdent(name: string): string {
  return `"${name}"`;
}

/**
 * Postgres returns BIGINT (needed for epoch-millis — INTEGER overflows
 * around year 2038) as a string by default, to avoid silently losing
 * precision beyond Number.MAX_SAFE_INTEGER. Real epoch-millis values are
 * nowhere near that limit, so coercing back to number here is safe.
 */
function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  return {
    ...row,
    updatedAt: row.updatedAt === null || row.updatedAt === undefined ? row.updatedAt : Number(row.updatedAt),
    deletedAt: row.deletedAt === null || row.deletedAt === undefined ? row.deletedAt : Number(row.deletedAt),
  };
}

/**
 * Postgres-backed data layer for one entity — see `IResourceStore` for the
 * port contract this implements. Table/column names come from
 * `PostgresResourceStoreConfig`, not a schema-inspection step, so the SQL
 * stays simple parameterized text instead of a query builder.
 */
export class PostgresResourceStore<TEntity extends IResourceBase> implements IResourceStore<TEntity> {
  constructor(
    private readonly _executor: QueryExecutor,
    private readonly _config: PostgresResourceStoreConfig
  ) {}

  async list({ since, limit }: IListQuery): Promise<ResourceRow<TEntity>[]> {
    const table = quoteIdent(this._config.table);
    const result = await this._executor.query(
      `SELECT * FROM ${table} WHERE COALESCE("deletedAt", "updatedAt") > $1 ORDER BY COALESCE("deletedAt", "updatedAt") ASC, "id" ASC LIMIT $2`,
      [since, limit]
    );
    return (result.rows as Record<string, unknown>[]).map((row) => this._toResourceRow(row));
  }

  async get(id: number): Promise<TEntity | null> {
    const table = quoteIdent(this._config.table);
    const result = await this._executor.query(
      `SELECT * FROM ${table} WHERE "id" = $1 AND "deletedAt" IS NULL`,
      [id]
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row === undefined ? null : (normalizeRow(row) as unknown as TEntity);
  }

  async create(fields: WritableFields<TEntity>): Promise<TEntity> {
    const table = quoteIdent(this._config.table);
    const updatedAt = tick();
    const values = this._config.columns.map((column) => (fields as Record<string, unknown>)[column]);
    const columnList = this._config.columns.map(quoteIdent).join(', ');
    const placeholders = this._config.columns.map((_, i) => `$${i + 1}`).join(', ');

    const result = await this._executor.query(
      `INSERT INTO ${table} (${columnList}, "updatedAt", "deletedAt") VALUES (${placeholders}, $${this._config.columns.length + 1}, NULL) RETURNING *`,
      [...values, updatedAt]
    );
    return normalizeRow(result.rows[0] as Record<string, unknown>) as unknown as TEntity;
  }

  async update(id: number, patch: Partial<WritableFields<TEntity>>): Promise<TEntity | null> {
    const table = quoteIdent(this._config.table);
    const updatedAt = tick();
    const patchedColumns = this._config.columns.filter((column) => column in (patch as object));
    const setClauses = patchedColumns.map((column, i) => `${quoteIdent(column)} = $${i + 1}`);
    setClauses.push(`"updatedAt" = $${patchedColumns.length + 1}`);
    const values = patchedColumns.map((column) => (patch as Record<string, unknown>)[column]);

    const result = await this._executor.query(
      `UPDATE ${table} SET ${setClauses.join(', ')} WHERE "id" = $${patchedColumns.length + 2} AND "deletedAt" IS NULL RETURNING *`,
      [...values, updatedAt, id]
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row === undefined ? null : (normalizeRow(row) as unknown as TEntity);
  }

  async remove(id: number): Promise<boolean> {
    const table = quoteIdent(this._config.table);
    const deletedAt = tick();
    const result = await this._executor.query(
      `UPDATE ${table} SET "deletedAt" = $1 WHERE "id" = $2 AND "deletedAt" IS NULL RETURNING "id"`,
      [deletedAt, id]
    );
    return result.rows.length > 0;
  }

  private _toResourceRow(row: Record<string, unknown>): ResourceRow<TEntity> {
    const normalized = normalizeRow(row);
    if (normalized.deletedAt !== null && normalized.deletedAt !== undefined) {
      return { id: normalized.id, deletedAt: normalized.deletedAt } as ResourceRow<TEntity>;
    }
    return normalized as unknown as TEntity;
  }
}
