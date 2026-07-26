import type { IColumnInfo, Row } from '../../../types';

export interface IRowGridProps {
  columns: IColumnInfo[];
  rows: Row[];
  page: number;
  hasNextPage: boolean;
  onNextPage: () => void;
  onPrevPage: () => void;
  onUpdateCell: (row: Row, column: string, value: string) => void | Promise<void>;
  onDeleteRow: (row: Row) => void;
  onDeleteRows: (rows: Row[]) => void;
}
