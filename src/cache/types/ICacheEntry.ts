export interface ICacheEntry<T> {
  data: T[] | null;
  error: unknown;
  tables: string[];
  queryFn: () => T[];
  listeners: Set<() => void>;
};
