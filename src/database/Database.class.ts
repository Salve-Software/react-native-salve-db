import type { AnySchema } from '../types';
import type { IConfigureProps, IQueryClient, IRegisterProps } from './classes';
import { ConfigureDb, QueryDb } from './classes';

export class Database {
  private static readonly configureDb = new ConfigureDb()
  private static readonly queryDb = new QueryDb()

  private constructor() {}

  // ── Lifecycle ───────────────────────────────────────────────────────────────
  static configure = (props: IConfigureProps) => {
    return this.configureDb.configure(props)
  }

  static register = (props: IRegisterProps) => {
    return this.configureDb.register(props)
  }

  // ── Queries ─────────────────────────────────────────────────────────────────
  static select = <TSchema extends AnySchema>(schema: TSchema) => {
    return this.queryDb.select(schema);
  }
  
  static insert = <TSchema extends AnySchema>(schema: TSchema) => {
    return this.queryDb.insert(schema);
  }
  
  static update = <TSchema extends AnySchema>(schema: TSchema) => {
    return this.queryDb.update(schema);
  }
  
  static delete = <TSchema extends AnySchema>(schema: TSchema) => {
    return this.queryDb.delete(schema);
  }
  
  static transaction = <T>(fn: (tx: IQueryClient) => Promise<T>) => {
    return this.queryDb.transaction<T>(fn);
  }
  
  static execute = (sql: string, params?: unknown[]) => {
    return this.queryDb.execute(sql, params);
  }
}
