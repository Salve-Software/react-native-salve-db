import type { Condition } from '../types/query/Condition';
import type { SqlValue } from '../specs/types/SqlValue';

export const ne = (column: string, value: SqlValue): Condition => {
  return { op: 'ne', column, value } as unknown as Condition;
}
