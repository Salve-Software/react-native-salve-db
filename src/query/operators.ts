import type { Condition } from '../types/query/condition';
import type { SqlValue } from '../specs/types/sql-value';
import type { ConditionNode } from '../types/ConditionNode';

// ConditionNode is secretly the runtime representation of the opaque Condition type.
const node = (n: ConditionNode): Condition => n as unknown as Condition
export const _unwrap = (c: Condition): ConditionNode => c as unknown as ConditionNode

export function eq(column: string, value: SqlValue): Condition {
  return node({ op: 'eq', column, value })
}
export function ne(column: string, value: SqlValue): Condition {
  return node({ op: 'ne', column, value })
}
export function gt(column: string, value: SqlValue): Condition {
  return node({ op: 'gt', column, value })
}
export function gte(column: string, value: SqlValue): Condition {
  return node({ op: 'gte', column, value })
}
export function lt(column: string, value: SqlValue): Condition {
  return node({ op: 'lt', column, value })
}
export function lte(column: string, value: SqlValue): Condition {
  return node({ op: 'lte', column, value })
}
export function like(column: string, pattern: string): Condition {
  return node({ op: 'like', column, pattern })
}
export function inArray(column: string, values: SqlValue[]): Condition {
  return node({ op: 'inArray', column, values })
}
export function isNull(column: string): Condition {
  return node({ op: 'isNull', column })
}
export function isNotNull(column: string): Condition {
  return node({ op: 'isNotNull', column })
}
export function and(...conditions: Condition[]): Condition {
  return node({ op: 'and', conditions: conditions.map(_unwrap) })
}
export function or(...conditions: Condition[]): Condition {
  return node({ op: 'or', conditions: conditions.map(_unwrap) })
}
export function not(condition: Condition): Condition {
  return node({ op: 'not', condition: _unwrap(condition) })
}
