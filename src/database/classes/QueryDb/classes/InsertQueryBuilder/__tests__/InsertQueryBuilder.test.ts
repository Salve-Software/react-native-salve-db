import { InsertQueryBuilder } from '../InsertQueryBuilder.class';
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
};

function makeBridge() {
  return {
    execute: jest.fn().mockResolvedValue({ columns: [], rows: [] }),
  } as unknown as SalveDatabase;
}

function executedWith(bridge: SalveDatabase) {
  return (bridge.execute as jest.Mock).mock.calls[0] as [string, unknown[]];
}

describe('InsertQueryBuilder', () => {
  test('generates correct INSERT SQL and params', async () => {
    const bridge = makeBridge();
    await new InsertQueryBuilder(schema, bridge).values({ id: 1, name: 'Alice', age: 30 }).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('INSERT INTO "users" ("id", "name", "age") VALUES (?, ?, ?)');
    expect(params).toEqual([1, 'Alice', 30]);
  });

  test('omitted nullable columns are excluded from the INSERT', async () => {
    const bridge = makeBridge();
    await new InsertQueryBuilder(schema, bridge).values({ id: 2, name: 'Bob' }).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('INSERT INTO "users" ("id", "name") VALUES (?, ?)');
    expect(params).toEqual([2, 'Bob']);
  });

  test('throws if execute is called without values()', async () => {
    const bridge = makeBridge();
    await expect(new InsertQueryBuilder(schema, bridge).execute()).rejects.toThrow(
      'InsertQueryBuilder: call .values() before .execute()'
    );
  });
});
