import type { AnySchema } from '../../../../../types/schema/any-schema';
import type { Condition } from '../../../../../types/query/condition';
import type { IDeleteQueryBuilder } from '../../../../../types/query/query-client';
import type { SalveDatabase } from '../../../../../specs/SalveDatabase.nitro';
import type { SqlValue } from '../../../../../specs/types/sql-value';
import { compileCondition } from '../../library';
import { _unwrap } from '../../../../../query/operators';

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
      sql += ` WHERE ${compileCondition(_unwrap(this._condition), params)}`;
    };
    
    await this._bridge.execute(sql, params);
  }
}
