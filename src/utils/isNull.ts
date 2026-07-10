import type { Condition } from '../types/query/Condition';

export const isNull = (column: string): Condition => {
  return { op: 'isNull', column } as unknown as Condition;
}
