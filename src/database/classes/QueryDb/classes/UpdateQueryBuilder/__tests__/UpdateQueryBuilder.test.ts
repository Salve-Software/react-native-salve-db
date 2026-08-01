import { UpdateQueryBuilder } from '../UpdateQueryBuilder.class';
import { eq, and, gt } from '../../../../../../utils';
import type { SalveDatabase } from '../../../../../../specs/SalveDatabase.nitro';
import type { AnySchema } from '../../../../../../types';

jest.mock('../../../../../../sync', () => ({ requestWriteSync: jest.fn() }));
const { requestWriteSync } = require('../../../../../../sync') as { requestWriteSync: jest.Mock };

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

const syncEnabledSchema: AnySchema = {
  ...schema,
  name: 'orders',
  sync: {
    enabled: true,
    direction: 'bidirectional',
    conflict: { strategy: 'lastWriteWins' },
    transport: 'rest',
    endpoint: { basePath: '/orders', sinceParam: 'updatedAfter', limitParam: 'limit' },
  },
};

const syncDisabledSchema: AnySchema = {
  ...syncEnabledSchema,
  name: 'orders-disabled',
  sync: { ...syncEnabledSchema.sync!, enabled: false },
};

function makeBridge() {
  return {
    execute: jest.fn().mockReturnValue({ columns: [], rows: [] }),
  } as unknown as SalveDatabase;
}

function executedWith(bridge: SalveDatabase) {
  return (bridge.execute as jest.Mock).mock.calls[0] as [string, unknown[]];
}

describe('UpdateQueryBuilder', () => {
  beforeEach(() => {
    requestWriteSync.mockClear();
  });

  test('generates SET clause without WHERE', () => {
    const bridge = makeBridge();
    new UpdateQueryBuilder(schema, bridge).set({ name: 'Bob' }).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('UPDATE "users" SET "name" = ?');
    expect(params).toEqual(['Bob']);
  });

  test('generates SET clause with WHERE on the primary key', () => {
    const bridge = makeBridge();
    new UpdateQueryBuilder(schema, bridge)
      .set({ name: 'Bob', age: 25 })
      .where(eq('id', 1))
      .execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('UPDATE "users" SET "name" = ?, "age" = ? WHERE "id" = ?');
    expect(params).toEqual(['Bob', 25, 1]);
  });

  test('supports compound WHERE on indexed columns', () => {
    const bridge = makeBridge();
    new UpdateQueryBuilder(schema, bridge)
      .set({ name: 'Carol' })
      .where(and(gt('age', 18), eq('name', 'old')))
      .execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('UPDATE "users" SET "name" = ? WHERE ("age" > ? AND "name" = ?)');
    expect(params).toEqual(['Carol', 18, 'old']);
  });

  test('throws if execute is called without set()', () => {
    const bridge = makeBridge();
    expect(() => new UpdateQueryBuilder(syncEnabledSchema, bridge).execute()).toThrow(
      'UpdateQueryBuilder: call .set() with at least one field before .execute()'
    );
    expect(requestWriteSync).not.toHaveBeenCalled();
  });

  test('throws if set() is called with an empty object', () => {
    const bridge = makeBridge();
    expect(() => new UpdateQueryBuilder(syncEnabledSchema, bridge).set({}).execute()).toThrow(
      'UpdateQueryBuilder: call .set() with at least one field before .execute()'
    );
    expect(requestWriteSync).not.toHaveBeenCalled();
  });

  test('throws when where() targets a non-indexed, non-primary-key column', () => {
    const bridge = makeBridge();
    const noIndexSchema: AnySchema = { ...syncEnabledSchema, indexes: [] };
    expect(() =>
      new UpdateQueryBuilder(noIndexSchema, bridge).set({ name: 'Dave' }).where(eq('age', 40)).execute()
    ).toThrow(/index/i);
    expect(requestWriteSync).not.toHaveBeenCalled();
  });
});

describe('UpdateQueryBuilder — write-triggered sync', () => {
  beforeEach(() => {
    requestWriteSync.mockClear();
  });

  test('a sync-enabled schema requests a write-triggered sync after a successful update', () => {
    const bridge = makeBridge();
    new UpdateQueryBuilder(syncEnabledSchema, bridge).set({ name: 'Bob' }).execute();

    expect(requestWriteSync).toHaveBeenCalledWith('orders');
    expect(requestWriteSync).toHaveBeenCalledTimes(1);
  });

  test('a schema with no sync block never requests a write-triggered sync', () => {
    const bridge = makeBridge();
    new UpdateQueryBuilder(schema, bridge).set({ name: 'Bob' }).execute();

    expect(requestWriteSync).not.toHaveBeenCalled();
  });

  test('a schema with sync.enabled: false never requests a write-triggered sync', () => {
    const bridge = makeBridge();
    new UpdateQueryBuilder(syncDisabledSchema, bridge).set({ name: 'Bob' }).execute();

    expect(requestWriteSync).not.toHaveBeenCalled();
  });

  test('repeated execute() calls each ask for a write-triggered sync once', () => {
    const bridge = makeBridge();
    new UpdateQueryBuilder(syncEnabledSchema, bridge).set({ name: 'A' }).where(eq('id', 1)).execute();
    new UpdateQueryBuilder(syncEnabledSchema, bridge).set({ name: 'B' }).where(eq('id', 2)).execute();

    expect(requestWriteSync).toHaveBeenCalledTimes(2);
    expect(requestWriteSync).toHaveBeenNthCalledWith(1, 'orders');
    expect(requestWriteSync).toHaveBeenNthCalledWith(2, 'orders');
  });
});
