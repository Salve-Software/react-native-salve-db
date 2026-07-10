import type { Condition } from '../types/query/Condition';

export const and = (...conditions: Condition[]): Condition => {
  return { op: 'and', conditions: conditions.map(c => c as unknown) } as unknown as Condition;
}
