export interface IRunQueryProps<T> {
  tables: string[],
  queryFn: () => T[],
  listeners: Set<() => void>,
  previousData: T[] | null,
}
