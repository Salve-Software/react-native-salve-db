import type { Condition } from '../../../../../types/query/Condition';
import type { ConditionNode } from '../../../../../types/query/ConditionNode';
import type { SalveDatabase } from '../../../../../specs/SalveDatabase.nitro';
import type { SqlValue } from '../../../../../specs/types';
import type { AnySchema } from '../../../../../types';
import type { ICountQueryBuilder } from '../../types';
import { assertIndexedColumns, collectConditionColumns, compileCondition } from '../../library';

export class CountQueryBuilder<TSchema extends AnySchema>
  implements ICountQueryBuilder<TSchema>
{
  private _condition?: Condition;

  constructor(
    private readonly _schema: TSchema,
    private readonly _bridge: SalveDatabase,
  ) {}

  where(condition: Condition): this {
    this._condition = condition;
    return this;
  }

  execute(): number {
    if (this._condition) {
      assertIndexedColumns(this._schema, collectConditionColumns(this._condition as unknown as ConditionNode));
    }

    const params: SqlValue[] = [];
    let sql = `SELECT COUNT(*) FROM "${this._schema.name}"`;

    const userWhere = this._condition ? compileCondition(this._condition as unknown as ConditionNode, params) : undefined;
    sql += ` WHERE ${['"deletedAt" IS NULL', ...(userWhere ? [userWhere] : [])].join(' AND ')}`;

    const result = this._bridge.execute(sql, params);
    return Number(result.rows[0]?.[0] ?? 0);
  }
}
