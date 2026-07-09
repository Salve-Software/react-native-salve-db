import type { AnySchema } from '../types/schema/any-schema'
import type { InferInsertModel } from '../types/query/infer-model'
import type { IInsertQueryBuilder } from '../types/query/query-client'
import type { SalveQuery } from '../specs/SalveQuery.nitro'
import type { SqlValue } from '../specs/types/sql-value'

export class InsertQueryBuilder<TSchema extends AnySchema>
  implements IInsertQueryBuilder<TSchema>
{
  private _row?: InferInsertModel<TSchema>

  constructor(
    private readonly _schema: TSchema,
    private readonly _bridge: SalveQuery,
  ) {}

  values(row: InferInsertModel<TSchema>): this {
    this._row = row
    return this
  }

  async execute(): Promise<void> {
    if (!this._row) throw new Error('InsertQueryBuilder: call .values() before .execute()')

    const cols = Object.keys(this._row as Record<string, unknown>)
    const params: SqlValue[] = cols.map((col) => ((this._row as Record<string, SqlValue>)[col] ?? null))
    const colList = cols.map((c) => `"${c}"`).join(', ')
    const placeholders = cols.map(() => '?').join(', ')
    const sql = `INSERT INTO "${this._schema.name}" (${colList}) VALUES (${placeholders})`

    await this._bridge.execute(sql, params)
  }
}
