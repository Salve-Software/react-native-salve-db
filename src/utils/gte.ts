import type { Condition } from '../types/query/Condition';
import type { SqlValue } from '../specs/types/SqlValue';

export const gte = (column: string, value: SqlValue): Condition => {
  return { op: 'gte', column, value } as unknown as Condition;
}
