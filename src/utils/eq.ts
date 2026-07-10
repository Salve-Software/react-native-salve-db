import type { Condition } from '../types/query/Condition';
import type { SqlValue } from '../specs/types/SqlValue';

export const eq = (column: string, value: SqlValue): Condition => {
  return { op: 'eq', column, value } as unknown as Condition;
}
