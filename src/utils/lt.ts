import type { Condition } from '../types/query/Condition';
import type { SqlValue } from '../specs/types/SqlValue';

export const lt = (column: string, value: SqlValue): Condition => {
  return { op: 'lt', column, value } as unknown as Condition;
}
