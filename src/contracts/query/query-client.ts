import type { AnySchema } from "../schema/any-schema";
import type { Condition } from "./condition";
import type { InferSelectModel, InferInsertModel } from "./infer-model";

/** Cliente de query, obtido do database configurado. */
export interface QueryClient {
  select<TSchema extends AnySchema>(schema: TSchema): SelectQueryBuilder<TSchema>;

  insert<TSchema extends AnySchema>(schema: TSchema): InsertQueryBuilder<TSchema>;

  update<TSchema extends AnySchema>(schema: TSchema): UpdateQueryBuilder<TSchema>;

  delete<TSchema extends AnySchema>(schema: TSchema): DeleteQueryBuilder<TSchema>;

  /**
   * BEGIN/COMMIT/ROLLBACK nativo. Se `fn` lançar, faz ROLLBACK.
   * Todo write dentro de `tx` ainda dispara as triggers normalmente
   * (a fila de sync só é populada no COMMIT, não em cada write isolado).
   */
  transaction<T>(fn: (tx: QueryClient) => Promise<T>): Promise<T>;

  /**
   * Escape hatch. Sem type-safety, sem inferência — mas como a trigger
   * é a nível de tabela SQLite, raw SQL ainda fica rastreado pela
   * sync_queue normalmente.
   */
  execute(sql: string, params?: unknown[]): Promise<unknown[]>;
}

/** Builder de `select`, obtido via `QueryClient.select()`. */
export interface SelectQueryBuilder<TSchema extends AnySchema> {
  where(condition: Condition): this;
  orderBy(column: keyof InferSelectModel<TSchema>, direction?: "asc" | "desc"): this;
  limit(n: number): this;
  offset(n: number): this;
  execute(): Promise<InferSelectModel<TSchema>[]>;
}

/** Builder de `insert`, obtido via `QueryClient.insert()`. */
export interface InsertQueryBuilder<TSchema extends AnySchema> {
  values(row: InferInsertModel<TSchema>): this;
  execute(): Promise<void>;
}

/** Builder de `update`, obtido via `QueryClient.update()`. */
export interface UpdateQueryBuilder<TSchema extends AnySchema> {
  set(patch: Partial<InferInsertModel<TSchema>>): this;
  where(condition: Condition): this;
  execute(): Promise<void>;
}

/** Builder de `delete`, obtido via `QueryClient.delete()`. */
export interface DeleteQueryBuilder<_TSchema extends AnySchema> {
  where(condition: Condition): this;
  execute(): Promise<void>;
}
