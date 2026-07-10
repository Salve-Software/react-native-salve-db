import { SelectQueryBuilder } from '../SelectQueryBuilder.class';
import { eq, and, gt, isNull } from '../../../../../../utils';
import type { SalveDatabase } from '../../../../../../specs/SalveDatabase.nitro';
import type { IQueryResult } from '../../../../../../specs/types';
import type { AnySchema } from '../../../../../../types';

const schema: AnySchema = {
  name: 'users',
  version: 1,
  primaryKey: 'id',
  columns: {
    id:     { type: 'integer' },
    name:   { type: 'text' },
    active: { type: 'boolean' },
    age:    { type: 'integer', nullable: true },
  },
};

function makeBridge(result: IQueryResult = { columns: [], rows: [] }) {
  return { execute: jest.fn().mockResolvedValue(result) } as unknown as SalveDatabase;
}

function executedWith(bridge: SalveDatabase) {
  return (bridge.execute as jest.Mock).mock.calls[0] as [string, unknown[]];
}

describe('SelectQueryBuilder — SQL generation', () => {
  test('bare select', async () => {
    const bridge = makeBridge();
    await new SelectQueryBuilder(schema, bridge).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('SELECT * FROM "users"');
    expect(params).toEqual([]);
  });

  test('with where', async () => {
    const bridge = makeBridge();
    await new SelectQueryBuilder(schema, bridge).where(eq('age', 30)).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('SELECT * FROM "users" WHERE "age" = ?');
    expect(params).toEqual([30]);
  });

  test('with orderBy asc (default)', async () => {
    const bridge = makeBridge();
    await new SelectQueryBuilder(schema, bridge).orderBy('name').execute();
    const [sql] = executedWith(bridge);
    expect(sql).toBe('SELECT * FROM "users" ORDER BY "name" ASC');
  });

  test('with orderBy desc', async () => {
    const bridge = makeBridge();
    await new SelectQueryBuilder(schema, bridge).orderBy('age', 'desc').execute();
    const [sql] = executedWith(bridge);
    expect(sql).toBe('SELECT * FROM "users" ORDER BY "age" DESC');
  });

  test('with limit', async () => {
    const bridge = makeBridge();
    await new SelectQueryBuilder(schema, bridge).limit(10).execute();
    const [sql] = executedWith(bridge);
    expect(sql).toBe('SELECT * FROM "users" LIMIT 10');
  });

  test('with offset', async () => {
    const bridge = makeBridge();
    await new SelectQueryBuilder(schema, bridge).offset(20).execute();
    const [sql] = executedWith(bridge);
    expect(sql).toBe('SELECT * FROM "users" OFFSET 20');
  });

  test('where + orderBy + limit + offset combined', async () => {
    const bridge = makeBridge();
    await new SelectQueryBuilder(schema, bridge)
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

describe('SelectQueryBuilder — result mapping', () => {
  test('maps columns to row values', async () => {
    const bridge = makeBridge({
      columns: ['id', 'name'],
      rows: [[1, 'Alice']],
    });
    const rows = await new SelectQueryBuilder(schema, bridge).execute();
    expect(rows).toEqual([{ id: 1, name: 'Alice' }]);
  });

  test('converts boolean columns from 0/1 to false/true', async () => {
    const bridge = makeBridge({
      columns: ['id', 'active'],
      rows: [[1, 0], [2, 1]],
    });
    const rows = await new SelectQueryBuilder(schema, bridge).execute();
    expect(rows[0]).toMatchObject({ active: false });
    expect(rows[1]).toMatchObject({ active: true });
  });

  test('returns empty array when no rows', async () => {
    const bridge = makeBridge({ columns: ['id', 'name'], rows: [] });
    const rows = await new SelectQueryBuilder(schema, bridge).execute();
    expect(rows).toEqual([]);
  });
});
