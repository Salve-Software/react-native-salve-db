import type { AnySchema } from "../../../../types";
import type { InferInsertModel } from "../classes";

export interface IInsertQueryBuilder<TSchema extends AnySchema> {
  values(row: InferInsertModel<TSchema> | InferInsertModel<TSchema>[]): this;

  /**
   * Upsert: on conflict with the primary key, overwrites every other
   * inserted column with the incoming value (`excluded.col`).
   */
  onConflictDoUpdate(): this;

  execute(): void;
}
