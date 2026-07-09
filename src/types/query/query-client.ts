import type { AnySchema } from "../schema/any-schema";
import type { Condition } from "./condition";
import type { InferSelectModel, InferInsertModel } from "./infer-model";

/** Query client, obtained from the configured database. */
export interface IQueryClient {
  select<TSchema extends AnySchema>(schema: TSchema): ISelectQueryBuilder<TSchema>;

  insert<TSchema extends AnySchema>(schema: TSchema): IInsertQueryBuilder<TSchema>;

  update<TSchema extends AnySchema>(schema: TSchema): IUpdateQueryBuilder<TSchema>;

  delete<TSchema extends AnySchema>(schema: TSchema): IDeleteQueryBuilder<TSchema>;

  /**
   * Native BEGIN/COMMIT/ROLLBACK. If `fn` throws, rolls back.
   * Every write inside `tx` still fires triggers normally
   * (the sync queue is only populated on COMMIT, not on each isolated write).
   */
  transaction<T>(fn: (tx: IQueryClient) => Promise<T>): Promise<T>;

  /**
   * Escape hatch. No type safety or inference, but because the trigger
   * is defined at the SQLite table level, raw SQL is still tracked by
   * sync_queue normally.
   */
  execute(sql: string, params?: unknown[]): Promise<unknown[]>;
}

/** `select` builder, obtained via `IQueryClient.select()`. */
export interface ISelectQueryBuilder<TSchema extends AnySchema> {
  where(condition: Condition): this;
  orderBy(column: keyof InferSelectModel<TSchema>, direction?: "asc" | "desc"): this;
  limit(n: number): this;
  offset(n: number): this;
  execute(): Promise<InferSelectModel<TSchema>[]>;
}

/** `insert` builder, obtained via `IQueryClient.insert()`. */
export interface IInsertQueryBuilder<TSchema extends AnySchema> {
  values(row: InferInsertModel<TSchema>): this;
  execute(): Promise<void>;
}

/** `update` builder, obtained via `IQueryClient.update()`. */
export interface IUpdateQueryBuilder<TSchema extends AnySchema> {
  set(patch: Partial<InferInsertModel<TSchema>>): this;
  where(condition: Condition): this;
  execute(): Promise<void>;
}

/** `delete` builder, obtained via `IQueryClient.delete()`. */
export interface IDeleteQueryBuilder<_TSchema extends AnySchema> {
  where(condition: Condition): this;
  execute(): Promise<void>;
}
