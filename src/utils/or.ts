import type { Condition } from '../types/query/Condition';

export const or = (...conditions: Condition[]): Condition => {
  return { op: 'or', conditions: conditions.map(c => c as unknown) } as unknown as Condition;
}
