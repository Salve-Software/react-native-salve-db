import { DeleteQueryBuilder } from '../DeleteQueryBuilder.class';
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
    conflict: 'lastWriteWins',
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

const NOW = 1_700_000_000_000;

describe('DeleteQueryBuilder', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    requestWriteSync.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('bare delete soft-deletes every row by stamping deletedAt', () => {
    const bridge = makeBridge();
    new DeleteQueryBuilder(schema, bridge).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('UPDATE "users" SET "deletedAt" = ?');
    expect(params).toEqual([NOW]);
  });

  test('with where on the primary key appends WHERE clause', () => {
    const bridge = makeBridge();
    new DeleteQueryBuilder(schema, bridge).where(eq('id', 42)).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('UPDATE "users" SET "deletedAt" = ? WHERE "id" = ?');
    expect(params).toEqual([NOW, 42]);
  });

  test('with compound where on indexed columns', () => {
    const bridge = makeBridge();
    new DeleteQueryBuilder(schema, bridge)
      .where(and(gt('age', 60), eq('name', 'inactive')))
      .execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('UPDATE "users" SET "deletedAt" = ? WHERE ("age" > ? AND "name" = ?)');
    expect(params).toEqual([NOW, 60, 'inactive']);
  });

  test('throws when where() targets a non-indexed, non-primary-key column', () => {
    const bridge = makeBridge();
    const noIndexSchema: AnySchema = { ...syncEnabledSchema, indexes: [] };
    expect(() =>
      new DeleteQueryBuilder(noIndexSchema, bridge).where(eq('age', 60)).execute()
    ).toThrow(/index/i);
    expect(requestWriteSync).not.toHaveBeenCalled();
  });
});

describe('DeleteQueryBuilder — write-triggered sync', () => {
  beforeEach(() => {
    jest.spyOn(Date, 'now').mockReturnValue(NOW);
    requestWriteSync.mockClear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('a sync-enabled schema requests a write-triggered sync after a successful soft-delete', () => {
    const bridge = makeBridge();
    new DeleteQueryBuilder(syncEnabledSchema, bridge).execute();

    expect(requestWriteSync).toHaveBeenCalledWith('orders');
    expect(requestWriteSync).toHaveBeenCalledTimes(1);
  });

  test('a schema with no sync block never requests a write-triggered sync', () => {
    const bridge = makeBridge();
    new DeleteQueryBuilder(schema, bridge).execute();

    expect(requestWriteSync).not.toHaveBeenCalled();
  });

  test('a schema with sync.enabled: false never requests a write-triggered sync', () => {
    const bridge = makeBridge();
    new DeleteQueryBuilder(syncDisabledSchema, bridge).execute();

    expect(requestWriteSync).not.toHaveBeenCalled();
  });

  test('repeated execute() calls each ask for a write-triggered sync once', () => {
    const bridge = makeBridge();
    new DeleteQueryBuilder(syncEnabledSchema, bridge).where(eq('id', 1)).execute();
    new DeleteQueryBuilder(syncEnabledSchema, bridge).where(eq('id', 2)).execute();

    expect(requestWriteSync).toHaveBeenCalledTimes(2);
    expect(requestWriteSync).toHaveBeenNthCalledWith(1, 'orders');
    expect(requestWriteSync).toHaveBeenNthCalledWith(2, 'orders');
  });
});
