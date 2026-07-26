import type { SalveDatabase } from '../specs/SalveDatabase.nitro';
import type { AnySchema } from '../types';
import type { IConfigureProps, IQueryClient, IRegisterProps } from './classes';
import { NitroModules } from 'react-native-nitro-modules';
import { ConfigureDb, QueryDb, SyncDb } from './classes';

const _bridge = NitroModules.createHybridObject<SalveDatabase>('SalveDatabase');

/**
 * Public entry point of Salve DB. A static-only facade over the native
 * SQLite core — every method delegates to the same underlying connection,
 * there is no instance to construct.
 */
export class Database {
  private static readonly configureDb = new ConfigureDb(_bridge)
  private static readonly queryDb = new QueryDb(_bridge)
  private static readonly syncDb = new SyncDb(_bridge)

  private constructor() {}

  /**
   * Opens (or creates) the local database file and sets sync/auth config.
   * Must be called once, before `register`, `select`/`insert`/`update`/`delete`,
   * or `execute`.
   */
  static configure = (props: IConfigureProps) => {
    return this.configureDb.configure(props)
  }

  /**
   * Registers a schema: creates its table on first run, or applies pending
   * `ADD COLUMN` migrations if `schema.version` increased since the last run.
   * Requires `configure` to have run first.
   */
  static register = (props: IRegisterProps) => {
    return this.configureDb.register(props)
  }

  /** Starts a `SELECT` against `schema`'s table. Call `.execute()` on the returned builder to run it. */
  static select = <TSchema extends AnySchema>(schema: TSchema) => {
    return this.queryDb.select(schema);
  }

  /** Starts an `INSERT` into `schema`'s table. Call `.execute()` on the returned builder to run it. */
  static insert = <TSchema extends AnySchema>(schema: TSchema) => {
    return this.queryDb.insert(schema);
  }

  /** Starts an `UPDATE` on `schema`'s table. Call `.execute()` on the returned builder to run it. */
  static update = <TSchema extends AnySchema>(schema: TSchema) => {
    return this.queryDb.update(schema);
  }

  /** Starts a `DELETE` from `schema`'s table. Call `.execute()` on the returned builder to run it. */
  static delete = <TSchema extends AnySchema>(schema: TSchema) => {
    return this.queryDb.delete(schema);
  }

  /** Starts a `COUNT(*)` against `schema`'s table. Call `.execute()` on the returned builder to run it. */
  static count = <TSchema extends AnySchema>(schema: TSchema) => {
    return this.queryDb.count(schema);
  }

  /** Runs `fn` inside a native transaction (`BEGIN`/`COMMIT`), rolling back if `fn` throws. */
  static transaction = <T>(fn: (tx: IQueryClient) => T) => {
    return this.queryDb.transaction<T>(fn);
  }

  /** Escape hatch: runs raw parametrized SQL and returns the resulting rows as plain objects. */
  static execute = (sql: string, params?: unknown[]) => {
    return this.queryDb.execute(sql, params);
  }

  /**
   * Subscribes to table-level write notifications (insert/update/delete —
   * from any source: query builder, raw SQL, migrations, or background sync).
   * @returns A subscription id, pass to `unsubscribeFromChanges` to stop listening.
   */
  static subscribeToChanges = (callback: (tables: string[]) => void) => {
    return this.queryDb.subscribeToChanges(callback);
  }

  /** Stops a subscription previously created by `subscribeToChanges`. */
  static unsubscribeFromChanges = (id: number) => {
    return this.queryDb.unsubscribeFromChanges(id);
  }

  /** Triggers a sync session for a single schema. */
  static sync = (schemaName: string) => {
    return this.syncDb.sync(schemaName);
  }

  /** Triggers a sync session for every schema registered with `sync.enabled`. */
  static syncAll = () => {
    return this.syncDb.syncAll();
  }
}
