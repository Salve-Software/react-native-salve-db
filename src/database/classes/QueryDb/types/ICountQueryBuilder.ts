import type { AnySchema } from "../../../../types";
import type { Condition } from "../../../../types/query/Condition";

export interface ICountQueryBuilder<_TSchema extends AnySchema> {
  where(condition: Condition): this;
  execute(): number;
}
