import type { SalveDatabase } from '../../../specs/SalveDatabase.nitro';
import type { SqlValue } from '../../../specs/types';
import type { IQueryClient } from './types';
import type { AnySchema } from '../../../types';
import { SelectQueryBuilder, InsertQueryBuilder, UpdateQueryBuilder, DeleteQueryBuilder } from './classes';
import { ConfigureDb } from '../ConfigureDb';

export class QueryDb {
  constructor(private readonly _bridge: SalveDatabase) {}

  select<TSchema extends AnySchema>(schema: TSchema) {
    this._assertConfigured('select');
    return new SelectQueryBuilder(schema, this._bridge);
  }

  insert<TSchema extends AnySchema>(schema: TSchema) {
    this._assertConfigured('insert');
    return new InsertQueryBuilder(schema, this._bridge);
  }

  update<TSchema extends AnySchema>(schema: TSchema) {
    this._assertConfigured('update');
    return new UpdateQueryBuilder(schema, this._bridge);
  }

  delete<TSchema extends AnySchema>(schema: TSchema) {
    this._assertConfigured('delete');
    return new DeleteQueryBuilder(schema, this._bridge);
  }

  transaction<T>(fn: (tx: IQueryClient) => T): T {
    this._assertConfigured('transaction');
    this._bridge.beginTransaction();

    try {
      const result = fn(this._makeTxClient());
      this._bridge.commit();
      return result;
    } catch (err) {
      this._bridge.rollback();
      throw err;
    }
  }

  execute(sql: string, params?: unknown[]): unknown[] {
    this._assertConfigured('execute');
    const result = this._bridge.execute(sql, (params ?? []) as SqlValue[]);

    return result.rows.map((row) => {
      const obj: Record<string, unknown> = {};
      result.columns.forEach((col, i) => { obj[col] = row[i] });
      return obj;
    })
  }

  private _assertConfigured(method: string): void {
    if (!ConfigureDb.isConfigured()) {
      throw new Error(`Database.${method}: call Database.configure() first`);
    }
  }

  private _makeTxClient(): IQueryClient {
    return {
      select: <TSchema extends AnySchema>(schema: TSchema) =>
        new SelectQueryBuilder(schema, this._bridge),

      insert: <TSchema extends AnySchema>(schema: TSchema) =>
        new InsertQueryBuilder(schema, this._bridge),

      update: <TSchema extends AnySchema>(schema: TSchema) =>
        new UpdateQueryBuilder(schema, this._bridge),

      delete: <TSchema extends AnySchema>(schema: TSchema) =>
        new DeleteQueryBuilder(schema, this._bridge),

      transaction: <T>(fn: (tx: IQueryClient) => T) =>
        this.transaction(fn),

      execute: (sql: string, params?: unknown[]) =>
        this.execute(sql, params),
    }
  }
}
