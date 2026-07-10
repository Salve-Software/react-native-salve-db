import type { AnySchema } from "../../../../types";
import type { InferInsertModel } from "../classes";

export interface IInsertQueryBuilder<TSchema extends AnySchema> {
  values(row: InferInsertModel<TSchema>): this;
  execute(): Promise<void>;
}
