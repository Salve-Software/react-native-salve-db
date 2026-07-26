export interface IGetOrCreateEntryProps<T> {
  key: string,
  tables: string[],
  queryFn: () => T[],
}
