import type { SqlValue } from "../../specs/types";

/** Internal AST node */
export type ConditionNode =
  | { op: 'eq' | 'ne' | 'gt' | 'gte' | 'lt' | 'lte'; column: string; value: SqlValue }
  | { op: 'like'; column: string; pattern: string }
  | { op: 'inArray'; column: string; values: SqlValue[] }
  | { op: 'isNull' | 'isNotNull'; column: string }
  | { op: 'and' | 'or'; conditions: ConditionNode[] }
  | { op: 'not'; condition: ConditionNode }
