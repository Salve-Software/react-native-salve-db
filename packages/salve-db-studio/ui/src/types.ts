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

/** One connected app instance the Studio can browse — a device + its database file. */
export interface IDevice {
  id: string;
  platform: string;
  dbName: string;
}
