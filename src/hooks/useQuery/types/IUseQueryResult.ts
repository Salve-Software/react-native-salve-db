export interface IUseQueryResult<TRow> {
  data: TRow[] | null;
  error: unknown;
  isLoading: boolean;
}
