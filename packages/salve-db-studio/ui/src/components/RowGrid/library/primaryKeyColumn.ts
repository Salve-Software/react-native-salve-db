import type { IColumnInfo } from '../../../types';

export function primaryKeyColumn(columns: IColumnInfo[]): string | null {
  return columns.find((c) => Number(c.pk) > 0)?.name ?? null;
}
