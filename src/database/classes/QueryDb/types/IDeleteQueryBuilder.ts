import type { AnySchema } from "../../../../types";
import type { Condition } from "../../../../types/query/Condition";

export interface IDeleteQueryBuilder<_TSchema extends AnySchema> {
  where(condition: Condition): this;
  execute(): Promise<void>;
}
