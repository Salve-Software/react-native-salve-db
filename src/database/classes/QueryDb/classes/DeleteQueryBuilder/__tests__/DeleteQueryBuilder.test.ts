import { DeleteQueryBuilder } from '../DeleteQueryBuilder.class';
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
};

function makeBridge() {
  return {
    execute: jest.fn().mockResolvedValue({ columns: [], rows: [] }),
  } as unknown as SalveDatabase;
}

function executedWith(bridge: SalveDatabase) {
  return (bridge.execute as jest.Mock).mock.calls[0] as [string, unknown[]];
}

describe('DeleteQueryBuilder', () => {
  test('bare delete generates DELETE FROM without WHERE', async () => {
    const bridge = makeBridge();
    await new DeleteQueryBuilder(schema, bridge).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('DELETE FROM "users"');
    expect(params).toEqual([]);
  });

  test('with where appends WHERE clause', async () => {
    const bridge = makeBridge();
    await new DeleteQueryBuilder(schema, bridge).where(eq('id', 42)).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('DELETE FROM "users" WHERE "id" = ?');
    expect(params).toEqual([42]);
  });

  test('with compound where', async () => {
    const bridge = makeBridge();
    await new DeleteQueryBuilder(schema, bridge)
      .where(and(gt('age', 60), eq('name', 'inactive')))
      .execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('DELETE FROM "users" WHERE ("age" > ? AND "name" = ?)');
    expect(params).toEqual([60, 'inactive']);
  });
});
