import type { SalveDatabase } from '../specs/SalveDatabase.nitro';
import type { AnySchema } from '../types';
import type { IConfigureProps, IQueryClient, IRegisterProps } from './classes';
import { NitroModules } from 'react-native-nitro-modules';
import { ConfigureDb, QueryDb } from './classes';

const _bridge = NitroModules.createHybridObject<SalveDatabase>('SalveDatabase');

export class Database {
  private static readonly configureDb = new ConfigureDb(_bridge)
  private static readonly queryDb = new QueryDb(_bridge)

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
  
  static transaction = <T>(fn: (tx: IQueryClient) => T) => {
    return this.queryDb.transaction<T>(fn);
  }
  
  static execute = (sql: string, params?: unknown[]) => {
    return this.queryDb.execute(sql, params);
  }
}
