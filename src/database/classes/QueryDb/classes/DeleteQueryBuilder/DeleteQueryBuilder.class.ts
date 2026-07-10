import type { Condition } from '../../../../../types/query/Condition';
import type { ConditionNode } from '../../../../../types/query/ConditionNode';
import type { SalveDatabase } from '../../../../../specs/SalveDatabase.nitro';
import type { SqlValue } from '../../../../../specs/types';
import type { AnySchema } from '../../../../../types';
import type { IDeleteQueryBuilder } from '../../types';
import { compileCondition } from '../../library';

export class DeleteQueryBuilder<TSchema extends AnySchema>
  implements IDeleteQueryBuilder<TSchema>
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

  async execute(): Promise<void> {
    const params: SqlValue[] = [];
    let sql = `DELETE FROM "${this._schema.name}"`;
    
    if (this._condition) {;
      sql += ` WHERE ${compileCondition(this._condition as unknown as ConditionNode, params)}`;
    };
    
    await this._bridge.execute(sql, params);
  }
}
