import type { AnySchema } from '../types/schema/any-schema'
import type { IQueryClient } from '../types/query/query-client'
import type { SalveQuery } from '../specs/SalveQuery.nitro'
import type { SqlValue } from '../specs/types/sql-value'
import { SelectQueryBuilder } from './SelectQueryBuilder'
import { InsertQueryBuilder } from './InsertQueryBuilder'
import { UpdateQueryBuilder } from './UpdateQueryBuilder'
import { DeleteQueryBuilder } from './DeleteQueryBuilder'

export class QueryClient implements IQueryClient {
  constructor(private readonly _bridge: SalveQuery) {}

  select<TSchema extends AnySchema>(schema: TSchema) {
    return new SelectQueryBuilder(schema, this._bridge)
  }

  insert<TSchema extends AnySchema>(schema: TSchema) {
    return new InsertQueryBuilder(schema, this._bridge)
  }

  update<TSchema extends AnySchema>(schema: TSchema) {
    return new UpdateQueryBuilder(schema, this._bridge)
  }

  delete<TSchema extends AnySchema>(schema: TSchema) {
    return new DeleteQueryBuilder(schema, this._bridge)
  }

  async transaction<T>(fn: (tx: IQueryClient) => Promise<T>): Promise<T> {
    await this._bridge.beginTransaction()
    try {
      const result = await fn(this)
      await this._bridge.commit()
      return result
    } catch (err) {
      await this._bridge.rollback()
      throw err
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<unknown[]> {
    const result = await this._bridge.execute(sql, (params ?? []) as SqlValue[])
    // Map columnar result to row objects
    return result.rows.map((row) => {
      const obj: Record<string, unknown> = {}
      result.columns.forEach((col, i) => { obj[col] = row[i] })
      return obj
    })
  }
}
