import type { ConditionNode } from '../../../../types/query/ConditionNode';

export const collectConditionColumns = (node: ConditionNode): string[] => {
  switch (node.op) {
    case 'eq':
    case 'ne':
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte':
    case 'like':
    case 'inArray':
    case 'isNull':
    case 'isNotNull':
      return [node.column]

    case 'and':
    case 'or':
      return node.conditions.flatMap(collectConditionColumns)

    case 'not':
      return collectConditionColumns(node.condition)
  }
}
