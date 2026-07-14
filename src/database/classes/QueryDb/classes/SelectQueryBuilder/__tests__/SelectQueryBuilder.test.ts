import { SelectQueryBuilder } from '../SelectQueryBuilder.class';
import { eq, and, gt, isNull } from '../../../../../../utils';
import { MAX_SYNC_PAGE_SIZE } from '../../../constants';
import type { SalveDatabase } from '../../../../../../specs/SalveDatabase.nitro';
import type { QueryResult } from '../../../../../../specs/types';
import type { AnySchema } from '../../../../../../types';

const schema: AnySchema = {
  name: 'users',
  version: 1,
  primaryKey: 'id',
  columns: {
    id:         { type: 'integer' },
    name:       { type: 'text' },
    active:     { type: 'boolean' },
    age:        { type: 'integer', nullable: true },
    deleted_at: { type: 'datetime', nullable: true },
  },
  indexes: [
    { name: 'idx_age', columns: ['age'] },
    { name: 'idx_name', columns: ['name'] },
    { name: 'idx_deleted_at_status', columns: ['deleted_at', 'active'] },
  ],
};

function makeBridge(result: QueryResult = { columns: [], rows: [] }) {
  return { execute: jest.fn().mockReturnValue(result) } as unknown as SalveDatabase;
}

function executedWith(bridge: SalveDatabase) {
  return (bridge.execute as jest.Mock).mock.calls[0] as [string, unknown[]];
}

describe('SelectQueryBuilder — SQL generation', () => {
  test('bare select', () => {
    const bridge = makeBridge();
    new SelectQueryBuilder(schema, bridge).limit(10).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('SELECT * FROM "users" LIMIT 10');
    expect(params).toEqual([]);
  });

  test('with where on an indexed column', () => {
    const bridge = makeBridge();
    new SelectQueryBuilder(schema, bridge).where(eq('age', 30)).limit(10).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('SELECT * FROM "users" WHERE "age" = ? LIMIT 10');
    expect(params).toEqual([30]);
  });

  test('with where on the primary key needs no index', () => {
    const bridge = makeBridge();
    new SelectQueryBuilder(schema, bridge).where(eq('id', 1)).limit(1).execute();
    const [sql] = executedWith(bridge);
    expect(sql).toBe('SELECT * FROM "users" WHERE "id" = ? LIMIT 1');
  });

  test('with orderBy asc (default) on an indexed column', () => {
    const bridge = makeBridge();
    new SelectQueryBuilder(schema, bridge).orderBy('name').limit(10).execute();
    const [sql] = executedWith(bridge);
    expect(sql).toBe('SELECT * FROM "users" ORDER BY "name" ASC LIMIT 10');
  });

  test('with orderBy desc on an indexed column', () => {
    const bridge = makeBridge();
    new SelectQueryBuilder(schema, bridge).orderBy('age', 'desc').limit(10).execute();
    const [sql] = executedWith(bridge);
    expect(sql).toBe('SELECT * FROM "users" ORDER BY "age" DESC LIMIT 10');
  });

  test('with offset', () => {
    const bridge = makeBridge();
    new SelectQueryBuilder(schema, bridge).limit(10).offset(20).execute();
    const [sql] = executedWith(bridge);
    expect(sql).toBe('SELECT * FROM "users" LIMIT 10 OFFSET 20');
  });

  test('where + orderBy + limit + offset combined, both columns indexed', () => {
    const bridge = makeBridge();
    new SelectQueryBuilder(schema, bridge)
      .where(and(gt('age', 18), isNull('deleted_at')))
      .orderBy('name', 'asc')
      .limit(5)
      .offset(10)
      .execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe(
      'SELECT * FROM "users" WHERE ("age" > ? AND "deleted_at" IS NULL) ORDER BY "name" ASC LIMIT 5 OFFSET 10'
    );
    expect(params).toEqual([18]);
  });
});

describe('SelectQueryBuilder — sync execution guardrails', () => {
  test('throws when limit() was never called', () => {
    const bridge = makeBridge();
    expect(() => new SelectQueryBuilder(schema, bridge).execute()).toThrow(/limit/i);
  });

  test('throws when limit() exceeds MAX_SYNC_PAGE_SIZE', () => {
    const bridge = makeBridge();
    expect(() =>
      new SelectQueryBuilder(schema, bridge).limit(MAX_SYNC_PAGE_SIZE + 1).execute()
    ).toThrow(/MAX_SYNC_PAGE_SIZE/);
  });

  test('accepts limit() exactly at MAX_SYNC_PAGE_SIZE', () => {
    const bridge = makeBridge();
    expect(() =>
      new SelectQueryBuilder(schema, bridge).limit(MAX_SYNC_PAGE_SIZE).execute()
    ).not.toThrow();
  });

  test('throws when orderBy() targets a non-indexed, non-primary-key column', () => {
    const bridge = makeBridge();
    expect(() =>
      new SelectQueryBuilder(schema, bridge).orderBy('active').limit(10).execute()
    ).toThrow(/index/i);
  });

  test('throws when where() targets a non-indexed, non-primary-key column', () => {
    const bridge = makeBridge();
    expect(() =>
      new SelectQueryBuilder(schema, bridge).where(eq('active', true)).limit(10).execute()
    ).toThrow(/index/i);
  });

  test('a composite index only satisfies its leading column', () => {
    const bridge = makeBridge();
    expect(() =>
      new SelectQueryBuilder(schema, bridge).where(eq('deleted_at', null)).limit(10).execute()
    ).not.toThrow();
    expect(() =>
      new SelectQueryBuilder(schema, bridge).where(eq('active', true)).limit(10).execute()
    ).toThrow(/index/i);
  });
});

describe('SelectQueryBuilder — result mapping', () => {
  test('maps columns to row values', () => {
    const bridge = makeBridge({
      columns: ['id', 'name'],
      rows: [[1, 'Alice']],
    });
    const rows = new SelectQueryBuilder(schema, bridge).limit(10).execute();
    expect(rows).toEqual([{ id: 1, name: 'Alice' }]);
  });

  test('converts boolean columns from 0/1 to false/true', () => {
    const bridge = makeBridge({
      columns: ['id', 'active'],
      rows: [[1, 0], [2, 1]],
    });
    const rows = new SelectQueryBuilder(schema, bridge).limit(10).execute();
    expect(rows[0]).toMatchObject({ active: false });
    expect(rows[1]).toMatchObject({ active: true });
  });

  test('returns empty array when no rows', () => {
    const bridge = makeBridge({ columns: ['id', 'name'], rows: [] });
    const rows = new SelectQueryBuilder(schema, bridge).limit(10).execute();
    expect(rows).toEqual([]);
  });
});
