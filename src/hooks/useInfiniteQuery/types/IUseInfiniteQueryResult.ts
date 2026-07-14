export interface IUseInfiniteQueryResult<TRow> {
  /** All loaded pages flattened into a single array, in fetch order. */
  data: TRow[] | null;
  error: unknown;
  /** True until the first page has loaded. */
  isLoading: boolean;
  hasNextPage: boolean;
  /** No-op if `hasNextPage` is false. */
  fetchNextPage: () => void;
}
