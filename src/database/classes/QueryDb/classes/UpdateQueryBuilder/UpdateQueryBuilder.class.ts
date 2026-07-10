import type { Condition } from '../../../../../types/query/Condition';
import type { ConditionNode } from '../../../../../types/query/ConditionNode';
import type { SalveDatabase } from '../../../../../specs/SalveDatabase.nitro';
import type { SqlValue } from '../../../../../specs/types';
import type { IUpdateQueryBuilder } from '../../types';
import type { AnySchema } from '../../../../../types';
import type { InferInsertModel } from '../InsertQueryBuilder';
import { compileCondition } from '../../library';

export class UpdateQueryBuilder<TSchema extends AnySchema>
  implements IUpdateQueryBuilder<TSchema>
{
  private _patch?: Partial<InferInsertModel<TSchema>>;
  private _condition?: Condition;

  constructor(
    private readonly _schema: TSchema,
    private readonly _bridge: SalveDatabase,
  ) {}

  set(patch: Partial<InferInsertModel<TSchema>>): this {
    this._patch = patch;
    return this;
  }

  where(condition: Condition): this {
    this._condition = condition;
    return this;
  }

  async execute(): Promise<void> {
    if (!this._patch || Object.keys(this._patch).length === 0) {
      throw new Error('UpdateQueryBuilder: call .set() with at least one field before .execute()');
    }

    const params: SqlValue[] = [];
    const cols = Object.keys(this._patch as Record<string, unknown>);
    const setClause = cols
      .map((col) => {
        params.push(((this._patch as Record<string, SqlValue>)[col]) ?? null)
        return `"${col}" = ?`
      })
      .join(', ');

    let sql = `UPDATE "${this._schema.name}" SET ${setClause}`;
    if (this._condition) {
      sql += ` WHERE ${compileCondition(this._condition as unknown as ConditionNode, params)}`;
    }

    await this._bridge.execute(sql, params);
  }
}
