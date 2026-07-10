import type { SalveDatabase } from '../../../specs/SalveDatabase.nitro';
import type { SqlValue } from '../../../specs/types';
import type { IQueryClient } from './types';
import type { AnySchema } from '../../../types';
import { NitroModules } from 'react-native-nitro-modules';
import { SelectQueryBuilder, InsertQueryBuilder, UpdateQueryBuilder, DeleteQueryBuilder } from './classes';
import { ConfigureDb } from '../ConfigureDb';

const _bridge = NitroModules.createHybridObject<SalveDatabase>('SalveDatabase');

export class QueryDb {
  constructor() {}

  select<TSchema extends AnySchema>(schema: TSchema) {
    this._assertConfigured('select');
    return new SelectQueryBuilder(schema, _bridge);
  }

  insert<TSchema extends AnySchema>(schema: TSchema) {
    this._assertConfigured('insert');
    return new InsertQueryBuilder(schema, _bridge);
  }

  update<TSchema extends AnySchema>(schema: TSchema) {
    this._assertConfigured('update');
    return new UpdateQueryBuilder(schema, _bridge);
  }

  delete<TSchema extends AnySchema>(schema: TSchema) {
    this._assertConfigured('delete');
    return new DeleteQueryBuilder(schema, _bridge);
  }

  async transaction<T>(fn: (tx: IQueryClient) => Promise<T>): Promise<T> {
    this._assertConfigured('transaction');
    await _bridge.beginTransaction();

    try {
      const result = await fn(this._makeTxClient());
      await _bridge.commit();
      return result;
    } catch (err) {
      await _bridge.rollback();
      throw err;
    }
  }

  async execute(sql: string, params?: unknown[]): Promise<unknown[]> {
    this._assertConfigured('execute');
    const result = await _bridge.execute(sql, (params ?? []) as SqlValue[]);

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
        new SelectQueryBuilder(schema, _bridge),

      insert: <TSchema extends AnySchema>(schema: TSchema) =>
        new InsertQueryBuilder(schema, _bridge),

      update: <TSchema extends AnySchema>(schema: TSchema) =>
        new UpdateQueryBuilder(schema, _bridge),

      delete: <TSchema extends AnySchema>(schema: TSchema) =>
        new DeleteQueryBuilder(schema, _bridge),

      transaction: <T>(fn: (tx: IQueryClient) => Promise<T>) =>
        this.transaction(fn),

      execute: (sql: string, params?: unknown[]) =>
        this.execute(sql, params),
    }
  }
}
