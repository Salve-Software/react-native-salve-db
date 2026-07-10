import type { Condition } from '../../../../../types/query/Condition';
import type { ConditionNode } from '../../../../../types/query/ConditionNode';
import type { SalveDatabase } from '../../../../../specs/SalveDatabase.nitro';
import type { SqlValue } from '../../../../../specs/types';
import type { AnySchema } from '../../../../../types';
import type { InferSelectModel } from './types';
import { compileCondition } from '../../library';

export class SelectQueryBuilder<TSchema extends AnySchema> {
  private _condition?: Condition;
  private _orderByColumn?: string;
  private _orderByDir: 'asc' | 'desc' = 'asc';
  private _limit?: number;
  private _offset?: number;

  constructor(
    private readonly _schema: TSchema,
    private readonly _bridge: SalveDatabase,
  ) { }

  where(condition: Condition): this {
    this._condition = condition;
    return this;
  }

  orderBy(column: keyof InferSelectModel<TSchema>, direction: 'asc' | 'desc' = 'asc'): this {
    this._orderByColumn = column as string;
    this._orderByDir = direction;
    return this;
  }

  limit(n: number): this {
    this._limit = n;
    return this;
  }

  offset(n: number): this {
    this._offset = n;
    return this;
  }

  async execute(): Promise<InferSelectModel<TSchema>[]> {
    const params: SqlValue[] = [];
    let sql = `SELECT * FROM "${this._schema.name}"`;

    if (this._condition) {
      sql += ` WHERE ${compileCondition(this._condition as unknown as ConditionNode, params)}`;
    }
    
    if (this._orderByColumn) {
      sql += ` ORDER BY "${this._orderByColumn}" ${this._orderByDir.toUpperCase()}`;
    }
    
    if (this._limit !== undefined) {
      sql += ` LIMIT ${this._limit}`;
    }
    
    if (this._offset !== undefined) {
      sql += ` OFFSET ${this._offset}`;
    }

    const result = await this._bridge.execute(sql, params);
    
    return result.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      
      result.columns.forEach((col, i) => {
        const colDef = this._schema.columns[col]
        let value: unknown = row[i]
        if (colDef?.type === 'boolean' && typeof value === 'number') {
          value = value !== 0
        }
        obj[col] = value
      });
      
      return obj as InferSelectModel<TSchema>;
    })
  }
}
