import { UpdateQueryBuilder } from '../UpdateQueryBuilder.class';
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

describe('UpdateQueryBuilder', () => {
  test('generates SET clause without WHERE', async () => {
    const bridge = makeBridge();
    await new UpdateQueryBuilder(schema, bridge).set({ name: 'Bob' }).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('UPDATE "users" SET "name" = ?');
    expect(params).toEqual(['Bob']);
  });

  test('generates SET clause with WHERE', async () => {
    const bridge = makeBridge();
    await new UpdateQueryBuilder(schema, bridge)
      .set({ name: 'Bob', age: 25 })
      .where(eq('id', 1))
      .execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('UPDATE "users" SET "name" = ?, "age" = ? WHERE "id" = ?');
    expect(params).toEqual(['Bob', 25, 1]);
  });

  test('supports compound WHERE', async () => {
    const bridge = makeBridge();
    await new UpdateQueryBuilder(schema, bridge)
      .set({ name: 'Carol' })
      .where(and(gt('age', 18), eq('name', 'old')))
      .execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('UPDATE "users" SET "name" = ? WHERE ("age" > ? AND "name" = ?)');
    expect(params).toEqual(['Carol', 18, 'old']);
  });

  test('throws if execute is called without set()', async () => {
    const bridge = makeBridge();
    await expect(new UpdateQueryBuilder(schema, bridge).execute()).rejects.toThrow(
      'UpdateQueryBuilder: call .set() with at least one field before .execute()'
    );
  });

  test('throws if set() is called with an empty object', async () => {
    const bridge = makeBridge();
    await expect(new UpdateQueryBuilder(schema, bridge).set({}).execute()).rejects.toThrow(
      'UpdateQueryBuilder: call .set() with at least one field before .execute()'
    );
  });
});
