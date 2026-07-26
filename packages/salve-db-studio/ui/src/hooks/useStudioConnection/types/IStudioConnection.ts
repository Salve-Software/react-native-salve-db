import type { IColumnInfo, IDevice, Row } from "../../../types";

export interface IStudioConnection {
  appConnected: boolean;
  devices: IDevice[];
  selectedDeviceId: string | null;
  selectDevice: (id: string) => void;
  tables: string[];
  currentTable: string | null;
  columns: IColumnInfo[];
  rows: Row[];
  error: string | null;
  clearError: () => void;
  selectTable: (name: string) => void;
  refresh: () => void;
  insertRow: (values: Record<string, string>) => Promise<void>;
  updateCell: (row: Row, column: string, value: string) => Promise<void>;
  deleteRow: (row: Row) => Promise<void>;
  truncateTable: (table: string) => Promise<void>;
  deleteTable: (table: string) => Promise<void>;
  runSql: (sql: string) => Promise<Row[]>;
}
