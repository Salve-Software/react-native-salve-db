import type { IColumnInfo, Row } from '../../../types';

export interface IRowGridProps {
  columns: IColumnInfo[];
  rows: Row[];
  onUpdateCell: (row: Row, column: string, value: string) => void;
  onDeleteRow: (row: Row) => void;
}
