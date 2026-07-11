import type { AnySchema } from "../../../../types";
import type { IDeleteQueryBuilder } from "./IDeleteQueryBuilder";
import type { IInsertQueryBuilder } from "./IInsertQueryBuilder";
import type { ISelectQueryBuilder } from "./ISelectQueryBuilder";
import type { IUpdateQueryBuilder } from "./IUpdateQueryBuilder";

/** Query client, obtained from the configured database. */
export interface IQueryClient {
  select<TSchema extends AnySchema>(schema: TSchema): ISelectQueryBuilder<TSchema>;
  insert<TSchema extends AnySchema>(schema: TSchema): IInsertQueryBuilder<TSchema>;
  update<TSchema extends AnySchema>(schema: TSchema): IUpdateQueryBuilder<TSchema>;
  delete<TSchema extends AnySchema>(schema: TSchema): IDeleteQueryBuilder<TSchema>;

  /**
   * Native BEGIN/COMMIT/ROLLBACK, synchronous. If `fn` throws, rolls back.
   * Every write inside `tx` still fires triggers normally
   * (the sync queue is only populated on COMMIT, not on each isolated write).
   */
  transaction<T>(fn: (tx: IQueryClient) => T): T;

  /**
   * Escape hatch. No type safety or inference, but because the trigger
   * is defined at the SQLite table level, raw SQL is still tracked by
   * sync_queue normally.
   */
  execute(sql: string, params?: unknown[]): unknown[];
}