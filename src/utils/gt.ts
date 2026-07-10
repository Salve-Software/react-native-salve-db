import type { Condition } from '../types/query/Condition';
import type { SqlValue } from '../specs/types/SqlValue';

export const gt = (column: string, value: SqlValue): Condition => {
  return { op: 'gt', column, value } as unknown as Condition;
}
