import type { SalveDatabase } from '../../../../../specs/SalveDatabase.nitro';
import type { SqlValue } from '../../../../../specs/types';
import type { AnySchema } from '../../../../../types';
import type { IInsertQueryBuilder } from '../../types';
import type { InferInsertModel } from './types';
import { MAX_BATCH_INSERT_ROWS } from '../../constants';

export class InsertQueryBuilder<TSchema extends AnySchema>
  implements IInsertQueryBuilder<TSchema>
{
  private _rows?: InferInsertModel<TSchema>[];
  private _onConflictDoUpdate = false;

  constructor(
    private readonly _schema: TSchema,
    private readonly _bridge: SalveDatabase,
  ) {}

  values(row: InferInsertModel<TSchema> | InferInsertModel<TSchema>[]): this {
    this._rows = Array.isArray(row) ? row : [row]
    return this
  }

  onConflictDoUpdate(): this {
    this._onConflictDoUpdate = true
    return this
  }

  execute(): void {
    if (!this._rows || this._rows.length === 0) {
      throw new Error('InsertQueryBuilder: call .values() before .execute()')
    }
    if (this._rows.length > MAX_BATCH_INSERT_ROWS) {
      throw new Error(
        `InsertQueryBuilder: ${this._rows.length} rows exceeds MAX_BATCH_INSERT_ROWS (${MAX_BATCH_INSERT_ROWS}). ` +
        `Split into smaller batches, wrapped in Database.transaction() if they must be atomic.`,
      )
    }

    const cols = Object.keys(this._rows[0] as Record<string, unknown>)
    for (const row of this._rows) {
      const rowCols = Object.keys(row as Record<string, unknown>)
      if (rowCols.length !== cols.length || !rowCols.every((c) => cols.includes(c))) {
        throw new Error('InsertQueryBuilder: every row passed to .values() must have the same set of columns')
      }
    }

    const params: SqlValue[] = []
    const colList = cols.map((c) => `"${c}"`).join(', ')
    const rowPlaceholders = this._rows
      .map((row) => {
        const placeholders = cols.map((col) => {
          params.push((row as Record<string, SqlValue>)[col] ?? null)
          return '?'
        })
        return `(${placeholders.join(', ')})`
      })
      .join(', ')

    let sql = `INSERT INTO "${this._schema.name}" (${colList}) VALUES ${rowPlaceholders}`

    if (this._onConflictDoUpdate) {
      const updateCols = cols.filter((c) => c !== this._schema.primaryKey)
      if (updateCols.length === 0) {
        throw new Error('InsertQueryBuilder: onConflictDoUpdate() requires at least one non-primary-key column')
      }
      const setClause = updateCols.map((c) => `"${c}" = excluded."${c}"`).join(', ')
      sql += ` ON CONFLICT("${String(this._schema.primaryKey)}") DO UPDATE SET ${setClause}`
    }

    this._bridge.execute(sql, params)
  }
}
