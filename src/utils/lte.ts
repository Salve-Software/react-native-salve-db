import type { Condition } from '../types/query/Condition';
import type { SqlValue } from '../specs/types/SqlValue';

export const lte = (column: string, value: SqlValue): Condition => {
  return { op: 'lte', column, value } as unknown as Condition;
}
