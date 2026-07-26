/** One row of `PRAGMA table_info(...)`. */
export interface IColumnInfo {
  cid: number;
  name: string;
  type: string;
  notnull: number;
  dflt_value: unknown;
  pk: number;
}

export type Row = Record<string, unknown>;
