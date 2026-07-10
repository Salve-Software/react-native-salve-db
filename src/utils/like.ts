import type { Condition } from '../types/query/Condition';

export const like = (column: string, pattern: string): Condition => {
  return { op: 'like', column, pattern } as unknown as Condition;
}
