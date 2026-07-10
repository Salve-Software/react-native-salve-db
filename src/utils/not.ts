import type { Condition } from '../types/query/Condition';

export const not = (condition: Condition): Condition => {
  return { op: 'not', condition: condition as unknown } as unknown as Condition;
}
