import type { IResourceBase, IResourceStore, IListQuery, ResourceRow, WritableFields } from './types';

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

// Allocates updatedAt/deletedAt atomically under an advisory lock held for the whole transaction — mirrors the old in-process tick() (monotonic, never collides) but can't reorder relative to another writer's commit.
const ALLOCATE_TICK_MS = `
  WITH _lock AS (SELECT pg_advisory_xact_lock(823170563)),
       _tick AS (
         UPDATE _tick_state SET last_tick = GREATEST((extract(epoch FROM clock_timestamp()) * 1000)::bigint, last_tick + 1)
         FROM _lock WHERE id = 1
         RETURNING last_tick
       )
`;
const TICK_MS = `(SELECT last_tick FROM _tick)`;

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
    const values = this._config.columns.map((column) => (fields as Record<string, unknown>)[column]);
    const columnList = this._config.columns.map(quoteIdent).join(', ');
    const placeholders = this._config.columns.map((_, i) => `$${i + 1}`).join(', ');

    const result = await this._executor.query(
      `${ALLOCATE_TICK_MS}
       INSERT INTO ${table} (${columnList}, "updatedAt", "deletedAt")
       SELECT ${placeholders}, ${TICK_MS}, NULL
       RETURNING *`,
      values
    );
    return normalizeRow(result.rows[0] as Record<string, unknown>) as unknown as TEntity;
  }

  async update(id: number, patch: Partial<WritableFields<TEntity>>): Promise<TEntity | null> {
    const table = quoteIdent(this._config.table);
    const patchedColumns = this._config.columns.filter((column) => column in (patch as object));
    const setClauses = patchedColumns.map((column, i) => `${quoteIdent(column)} = $${i + 1}`);
    setClauses.push(`"updatedAt" = ${TICK_MS}`);
    const values = patchedColumns.map((column) => (patch as Record<string, unknown>)[column]);

    const result = await this._executor.query(
      `${ALLOCATE_TICK_MS}
       UPDATE ${table} SET ${setClauses.join(', ')} WHERE "id" = $${patchedColumns.length + 1} AND "deletedAt" IS NULL
       RETURNING *`,
      [...values, id]
    );
    const row = result.rows[0] as Record<string, unknown> | undefined;
    return row === undefined ? null : (normalizeRow(row) as unknown as TEntity);
  }

  async remove(id: number): Promise<boolean> {
    const table = quoteIdent(this._config.table);
    const result = await this._executor.query(
      `${ALLOCATE_TICK_MS}
       UPDATE ${table} SET "deletedAt" = ${TICK_MS} WHERE "id" = $1 AND "deletedAt" IS NULL
       RETURNING "id"`,
      [id]
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
