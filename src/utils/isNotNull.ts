import type { Condition } from '../types/query/Condition';

export const isNotNull = (column: string): Condition => {
  return { op: 'isNotNull', column } as unknown as Condition;
}
