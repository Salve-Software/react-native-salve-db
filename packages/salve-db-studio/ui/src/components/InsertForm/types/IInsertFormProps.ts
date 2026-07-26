import type { IColumnInfo } from '../../../types';

export interface IInsertFormProps {
  columns: IColumnInfo[];
  onSubmit: (values: Record<string, string>) => void;
}
