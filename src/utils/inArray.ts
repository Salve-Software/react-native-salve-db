import type { Condition } from '../types/query/Condition';
import type { SqlValue } from '../specs/types/SqlValue';

export const inArray = (column: string, values: SqlValue[]): Condition => {
  return { op: 'inArray', column, values } as unknown as Condition;
}
