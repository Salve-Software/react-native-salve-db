import type { SelectQueryBuilder } from "../../../database/classes/QueryDb/classes";
import type { AnySchema } from "../../../types";

export interface IUseQueryProps<TSchema extends AnySchema> {
  schema: TSchema,
  queryFn: (q: SelectQueryBuilder<TSchema>) => SelectQueryBuilder<TSchema>,
  deps?: unknown[],
}