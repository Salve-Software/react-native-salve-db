import type { AnySchema } from '../../../../../types/schema/any-schema';
import type { Condition } from '../../../../../types/query/condition';
import type { InferSelectModel } from '../../../../../types/query/infer-model';
import type { ISelectQueryBuilder } from '../../../../../types/query/query-client';
import type { SalveDatabase } from '../../../../../specs/SalveDatabase.nitro';
import type { SqlValue } from '../../../../../specs/types/sql-value';
import { compileCondition } from '../../library';
import { _unwrap } from '../../../../../query/operators';

export class SelectQueryBuilder<TSchema extends AnySchema>
  implements ISelectQueryBuilder<TSchema>
{
  private _condition?: Condition;
  private _orderByColumn?: string;
  private _orderByDir: 'asc' | 'desc' = 'asc';
  private _limit?: number;
  private _offset?: number;

  constructor(
    private readonly _schema: TSchema,
    private readonly _bridge: SalveDatabase,
  ) {}

  where(condition: Condition): this {
    this._condition = condition
    return this
  }

  orderBy(column: keyof InferSelectModel<TSchema>, direction: 'asc' | 'desc' = 'asc'): this {
    this._orderByColumn = column as string
    this._orderByDir = direction
    return this
  }

  limit(n: number): this {
    this._limit = n
    return this
  }

  offset(n: number): this {
    this._offset = n
    return this
  }

  async execute(): Promise<InferSelectModel<TSchema>[]> {
    const params: SqlValue[] = []
    let sql = `SELECT * FROM "${this._schema.name}"`

    if (this._condition) {
      sql += ` WHERE ${compileCondition(_unwrap(this._condition), params)}`
    }
    if (this._orderByColumn) {
      sql += ` ORDER BY "${this._orderByColumn}" ${this._orderByDir.toUpperCase()}`
    }
    if (this._limit !== undefined) {
      sql += ` LIMIT ${this._limit}`
    }
    if (this._offset !== undefined) {
      sql += ` OFFSET ${this._offset}`
    }

    const result = await this._bridge.execute(sql, params)
    return result.rows.map((row) => {
      const obj: Record<string, unknown> = {}
      result.columns.forEach((col, i) => {
        const colDef = this._schema.columns[col]
        let value: unknown = row[i]
        if (colDef?.type === 'boolean' && typeof value === 'number') {
          value = value !== 0
        }
        obj[col] = value
      })
      return obj as InferSelectModel<TSchema>
    })
  }
}
