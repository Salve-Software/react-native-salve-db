import type { AnySchema } from "../../../../types";
import type { Condition } from "../../../../types/query/Condition";
import type { InferSelectModel } from "../classes";

export interface ISelectQueryBuilder<TSchema extends AnySchema> {
  where(condition: Condition): this;
  orderBy(column: keyof InferSelectModel<TSchema>, direction?: "asc" | "desc"): this;
  limit(n: number): this;
  offset(n: number): this;
  execute(): Promise<InferSelectModel<TSchema>[]>;
}
