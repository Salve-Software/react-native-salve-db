import { CountQueryBuilder } from '../CountQueryBuilder.class';
import { eq, and, gt } from '../../../../../../utils';
import type { SalveDatabase } from '../../../../../../specs/SalveDatabase.nitro';
import type { AnySchema } from '../../../../../../types';

const schema: AnySchema = {
  name: 'users',
  version: 1,
  primaryKey: 'id',
  columns: {
    id:   { type: 'integer' },
    name: { type: 'text' },
    age:  { type: 'integer', nullable: true },
  },
  indexes: [
    { name: 'idx_age', columns: ['age'] },
    { name: 'idx_name', columns: ['name'] },
  ],
};

function makeBridge(count: number) {
  return {
    execute: jest.fn().mockReturnValue({ columns: ['COUNT(*)'], rows: [[count]] }),
  } as unknown as SalveDatabase;
}

function executedWith(bridge: SalveDatabase) {
  return (bridge.execute as jest.Mock).mock.calls[0] as [string, unknown[]];
}

describe('CountQueryBuilder', () => {
  test('bare count generates SELECT COUNT(*) without WHERE', () => {
    const bridge = makeBridge(3);
    const result = new CountQueryBuilder(schema, bridge).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('SELECT COUNT(*) FROM "users"');
    expect(params).toEqual([]);
    expect(result).toBe(3);
  });

  test('with where on the primary key appends WHERE clause', () => {
    const bridge = makeBridge(1);
    const result = new CountQueryBuilder(schema, bridge).where(eq('id', 42)).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('SELECT COUNT(*) FROM "users" WHERE "id" = ?');
    expect(params).toEqual([42]);
    expect(result).toBe(1);
  });

  test('with compound where on indexed columns', () => {
    const bridge = makeBridge(5);
    new CountQueryBuilder(schema, bridge)
      .where(and(gt('age', 60), eq('name', 'inactive')))
      .execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('SELECT COUNT(*) FROM "users" WHERE ("age" > ? AND "name" = ?)');
    expect(params).toEqual([60, 'inactive']);
  });

  test('throws when where() targets a non-indexed, non-primary-key column', () => {
    const bridge = makeBridge(0);
    const noIndexSchema: AnySchema = { ...schema, indexes: [] };
    expect(() =>
      new CountQueryBuilder(noIndexSchema, bridge).where(eq('age', 60)).execute()
    ).toThrow(/index/i);
  });
});
