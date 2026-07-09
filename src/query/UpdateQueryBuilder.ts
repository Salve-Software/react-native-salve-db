import type { AnySchema } from '../types/schema/any-schema'
import type { Condition } from '../types/query/condition'
import type { InferInsertModel } from '../types/query/infer-model'
import type { IUpdateQueryBuilder } from '../types/query/query-client'
import type { SalveQuery } from '../specs/SalveQuery.nitro'
import type { SqlValue } from '../specs/types/sql-value'
import { compileCondition } from './condition-node'
import { _unwrap } from './operators'

export class UpdateQueryBuilder<TSchema extends AnySchema>
  implements IUpdateQueryBuilder<TSchema>
{
  private _patch?: Partial<InferInsertModel<TSchema>>
  private _condition?: Condition

  constructor(
    private readonly _schema: TSchema,
    private readonly _bridge: SalveQuery,
  ) {}

  set(patch: Partial<InferInsertModel<TSchema>>): this {
    this._patch = patch
    return this
  }

  where(condition: Condition): this {
    this._condition = condition
    return this
  }

  async execute(): Promise<void> {
    if (!this._patch || Object.keys(this._patch).length === 0) {
      throw new Error('UpdateQueryBuilder: call .set() with at least one field before .execute()')
    }

    const params: SqlValue[] = []
    const cols = Object.keys(this._patch as Record<string, unknown>)
    const setClause = cols
      .map((col) => {
        params.push(((this._patch as Record<string, SqlValue>)[col]) ?? null)
        return `"${col}" = ?`
      })
      .join(', ')

    let sql = `UPDATE "${this._schema.name}" SET ${setClause}`
    if (this._condition) {
      sql += ` WHERE ${compileCondition(_unwrap(this._condition), params)}`
    }

    await this._bridge.execute(sql, params)
  }
}
