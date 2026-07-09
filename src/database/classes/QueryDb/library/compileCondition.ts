import type { SqlValue } from '../../../../specs/types/sql-value';
import type { ConditionNode } from '../../../../types/ConditionNode';

export const compileCondition = (node: ConditionNode, params: SqlValue[]): string => {
  switch (node.op) {
    case 'eq':
      params.push(node.value)
      return `"${node.column}" = ?`
      
    case 'ne':
      params.push(node.value)
      return `"${node.column}" != ?`
      
    case 'gt':
      params.push(node.value)
      return `"${node.column}" > ?`
      
    case 'gte':
      params.push(node.value)
      return `"${node.column}" >= ?`
      
    case 'lt':
      params.push(node.value)
      return `"${node.column}" < ?`
      
    case 'lte':
      params.push(node.value)
      return `"${node.column}" <= ?`
      
    case 'like':
      params.push(node.pattern)
      return `"${node.column}" LIKE ?`
      
    case 'inArray': {
      const placeholders = node.values.map((v) => { params.push(v); return '?' }).join(', ')
      return `"${node.column}" IN (${placeholders})`
    }
    
    case 'isNull':
      return `"${node.column}" IS NULL`
      
    case 'isNotNull':
      return `"${node.column}" IS NOT NULL`
      
    case 'and': {
      if (node.conditions.length === 0) return '1'
      const parts = node.conditions.map((c) => compileCondition(c, params))
      return node.conditions.length === 1 ? (parts[0] ?? '1') : `(${parts.join(' AND ')})`
    }
    
    case 'or': {
      if (node.conditions.length === 0) return '0'
      const parts = node.conditions.map((c) => compileCondition(c, params))
      return node.conditions.length === 1 ? (parts[0] ?? '0') : `(${parts.join(' OR ')})`
    }
    
    case 'not':
      return `NOT (${compileCondition(node.condition, params)})`
  }
}
