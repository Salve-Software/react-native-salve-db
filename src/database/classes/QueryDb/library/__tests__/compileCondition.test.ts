import { compileCondition } from '../compileCondition';
import type { ConditionNode } from '../../../../../types/query/ConditionNode';
import type { SqlValue } from '../../../../../specs/types';

function compile(node: ConditionNode): { sql: string; params: SqlValue[] } {
  const params: SqlValue[] = [];
  const sql = compileCondition(node, params);
  return { sql, params };
}

describe('compileCondition — scalar operators', () => {
  test.each([
    ['eq',  '='],
    ['ne',  '!='],
    ['gt',  '>'],
    ['gte', '>='],
    ['lt',  '<'],
    ['lte', '<='],
  ] as const)('%s produces "col" OP ? and pushes the value', (op, symbol) => {
    const { sql, params } = compile({ op, column: 'age', value: 30 });
    expect(sql).toBe(`"age" ${symbol} ?`);
    expect(params).toEqual([30]);
  });

  test('like produces LIKE ? and pushes the pattern', () => {
    const { sql, params } = compile({ op: 'like', column: 'name', pattern: 'Jo%' });
    expect(sql).toBe('"name" LIKE ?');
    expect(params).toEqual(['Jo%']);
  });

  test('inArray produces IN (?, ...) and pushes all values', () => {
    const { sql, params } = compile({ op: 'inArray', column: 'status', values: ['a', 'b', 'c'] });
    expect(sql).toBe('"status" IN (?, ?, ?)');
    expect(params).toEqual(['a', 'b', 'c']);
  });

  test('inArray with a single value produces IN (?)', () => {
    const { sql, params } = compile({ op: 'inArray', column: 'id', values: [1] });
    expect(sql).toBe('"id" IN (?)');
    expect(params).toEqual([1]);
  });

  test('isNull produces IS NULL with no params', () => {
    const { sql, params } = compile({ op: 'isNull', column: 'deleted_at' });
    expect(sql).toBe('"deleted_at" IS NULL');
    expect(params).toEqual([]);
  });

  test('isNotNull produces IS NOT NULL with no params', () => {
    const { sql, params } = compile({ op: 'isNotNull', column: 'email' });
    expect(sql).toBe('"email" IS NOT NULL');
    expect(params).toEqual([]);
  });
});

describe('compileCondition — logical operators', () => {
  const ageGt18: ConditionNode = { op: 'gt', column: 'age', value: 18 };
  const nameEq: ConditionNode = { op: 'eq', column: 'name', value: 'Alice' };

  test('and with two conditions wraps in parentheses', () => {
    const { sql, params } = compile({ op: 'and', conditions: [ageGt18, nameEq] });
    expect(sql).toBe('("age" > ? AND "name" = ?)');
    expect(params).toEqual([18, 'Alice']);
  });

  test('and with a single condition returns it unwrapped', () => {
    const { sql, params } = compile({ op: 'and', conditions: [ageGt18] });
    expect(sql).toBe('"age" > ?');
    expect(params).toEqual([18]);
  });

  test('and with no conditions returns 1', () => {
    const { sql, params } = compile({ op: 'and', conditions: [] });
    expect(sql).toBe('1');
    expect(params).toEqual([]);
  });

  test('or with two conditions wraps in parentheses', () => {
    const { sql, params } = compile({ op: 'or', conditions: [ageGt18, nameEq] });
    expect(sql).toBe('("age" > ? OR "name" = ?)');
    expect(params).toEqual([18, 'Alice']);
  });

  test('or with a single condition returns it unwrapped', () => {
    const { sql, params } = compile({ op: 'or', conditions: [nameEq] });
    expect(sql).toBe('"name" = ?');
    expect(params).toEqual(['Alice']);
  });

  test('or with no conditions returns 0', () => {
    const { sql, params } = compile({ op: 'or', conditions: [] });
    expect(sql).toBe('0');
    expect(params).toEqual([]);
  });

  test('not wraps its inner condition', () => {
    const { sql, params } = compile({ op: 'not', condition: ageGt18 });
    expect(sql).toBe('NOT ("age" > ?)');
    expect(params).toEqual([18]);
  });
});

describe('compileCondition — nested conditions', () => {
  test('and(eq, or(ne, isNull)) compiles correctly', () => {
    const node: ConditionNode = {
      op: 'and',
      conditions: [
        { op: 'eq', column: 'active', value: true },
        {
          op: 'or',
          conditions: [
            { op: 'ne', column: 'role', value: 'guest' },
            { op: 'isNull', column: 'deleted_at' },
          ],
        },
      ],
    };
    const { sql, params } = compile(node);
    expect(sql).toBe('("active" = ? AND ("role" != ? OR "deleted_at" IS NULL))');
    expect(params).toEqual([true, 'guest']);
  });

  test('not(and(eq, gt)) compiles correctly', () => {
    const node: ConditionNode = {
      op: 'not',
      condition: {
        op: 'and',
        conditions: [
          { op: 'eq', column: 'type', value: 'admin' },
          { op: 'gt', column: 'score', value: 100 },
        ],
      },
    };
    const { sql, params } = compile(node);
    expect(sql).toBe('NOT (("type" = ? AND "score" > ?))');
    expect(params).toEqual(['admin', 100]);
  });

  test('params accumulate in left-to-right order across a nested tree', () => {
    const node: ConditionNode = {
      op: 'and',
      conditions: [
        { op: 'gte', column: 'age', value: 18 },
        { op: 'lte', column: 'age', value: 65 },
        { op: 'inArray', column: 'country', values: ['BR', 'US'] },
      ],
    };
    const { sql, params } = compile(node);
    expect(sql).toBe('("age" >= ? AND "age" <= ? AND "country" IN (?, ?))');
    expect(params).toEqual([18, 65, 'BR', 'US']);
  });
});
