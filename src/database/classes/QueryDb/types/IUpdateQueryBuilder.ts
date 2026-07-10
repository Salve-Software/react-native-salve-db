import type { AnySchema } from "../../../../types";
import type { Condition } from "../../../../types/query/Condition";
import type { InferInsertModel } from "../classes";

export interface IUpdateQueryBuilder<TSchema extends AnySchema> {
  set(patch: Partial<InferInsertModel<TSchema>>): this;
  where(condition: Condition): this;
  execute(): Promise<void>;
}
