import type { SelectQueryBuilder } from "../../../database/classes/QueryDb/classes";
import type { JsonValue } from "../../useQuery/types";
import type { AnySchema } from "../../../types";

export interface IUseInfiniteQueryProps<TSchema extends AnySchema> {
  schema: TSchema,
  /** Apply `where`/`orderBy` here — do not call `.limit()`/`.offset()`, the hook manages paging. */
  queryFn: (q: SelectQueryBuilder<TSchema>) => SelectQueryBuilder<TSchema>,
  /** Rows fetched per page, forwarded to `.limit()` (subject to `MAX_SYNC_PAGE_SIZE`). */
  pageSize: number,
  deps?: readonly JsonValue[],
}
