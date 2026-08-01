import { InsertQueryBuilder } from '../InsertQueryBuilder.class';
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

describe('InsertQueryBuilder', () => {
  beforeEach(() => {
    requestWriteSync.mockClear();
  });

  test('generates correct INSERT SQL and params', () => {
    const bridge = makeBridge();
    new InsertQueryBuilder(schema, bridge).values({ id: 1, name: 'Alice', age: 30 }).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('INSERT INTO "users" ("id", "name", "age") VALUES (?, ?, ?)');
    expect(params).toEqual([1, 'Alice', 30]);
  });

  test('omitted nullable columns are excluded from the INSERT', () => {
    const bridge = makeBridge();
    new InsertQueryBuilder(schema, bridge).values({ id: 2, name: 'Bob' }).execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('INSERT INTO "users" ("id", "name") VALUES (?, ?)');
    expect(params).toEqual([2, 'Bob']);
  });

  test('throws if execute is called without values()', () => {
    const bridge = makeBridge();
    expect(() => new InsertQueryBuilder(syncEnabledSchema, bridge).execute()).toThrow(
      'InsertQueryBuilder: call .values() before .execute()'
    );
    expect(requestWriteSync).not.toHaveBeenCalled();
  });

  test('accepts an array of rows and generates a multi-row INSERT', () => {
    const bridge = makeBridge();
    new InsertQueryBuilder(schema, bridge)
      .values([
        { id: 1, name: 'Alice', age: 30 },
        { id: 2, name: 'Bob', age: 25 },
      ])
      .execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe('INSERT INTO "users" ("id", "name", "age") VALUES (?, ?, ?), (?, ?, ?)');
    expect(params).toEqual([1, 'Alice', 30, 2, 'Bob', 25]);
  });

  test('throws if rows in a batch have different columns', () => {
    const bridge = makeBridge();
    expect(() =>
      new InsertQueryBuilder(syncEnabledSchema, bridge)
        .values([{ id: 1, name: 'Alice', age: 30 }, { id: 2, name: 'Bob' }])
        .execute()
    ).toThrow('InsertQueryBuilder: every row passed to .values() must have the same set of columns');
    expect(requestWriteSync).not.toHaveBeenCalled();
  });

  test('throws if batch exceeds MAX_BATCH_INSERT_ROWS', () => {
    const bridge = makeBridge();
    const rows = Array.from({ length: 501 }, (_, i) => ({ id: i, name: 'x' }));
    expect(() => new InsertQueryBuilder(syncEnabledSchema, bridge).values(rows).execute()).toThrow(
      /exceeds MAX_BATCH_INSERT_ROWS/
    );
    expect(requestWriteSync).not.toHaveBeenCalled();
  });

  test('throws if batch is within MAX_BATCH_INSERT_ROWS but exceeds SQLITE_MAX_BOUND_PARAMS', () => {
    const bridge = makeBridge();
    const rows = Array.from({ length: 400 }, (_, i) => ({ id: i, name: 'x', age: 1 }));
    expect(() => new InsertQueryBuilder(syncEnabledSchema, bridge).values(rows).execute()).toThrow(
      /exceeds SQLITE_MAX_BOUND_PARAMS/
    );
    expect(requestWriteSync).not.toHaveBeenCalled();
  });

  test('onConflictDoUpdate() appends ON CONFLICT DO UPDATE targeting the primary key', () => {
    const bridge = makeBridge();
    new InsertQueryBuilder(schema, bridge)
      .values({ id: 1, name: 'Alice', age: 30 })
      .onConflictDoUpdate()
      .execute();
    const [sql, params] = executedWith(bridge);
    expect(sql).toBe(
      'INSERT INTO "users" ("id", "name", "age") VALUES (?, ?, ?) ON CONFLICT("id") DO UPDATE SET "name" = excluded."name", "age" = excluded."age"'
    );
    expect(params).toEqual([1, 'Alice', 30]);
  });

  test('onConflictDoUpdate() throws if the row only has the primary key column', () => {
    const bridge = makeBridge();
    expect(() =>
      new InsertQueryBuilder(syncEnabledSchema, bridge).values({ id: 1 } as never).onConflictDoUpdate().execute()
    ).toThrow('InsertQueryBuilder: onConflictDoUpdate() requires at least one non-primary-key column');
    expect(requestWriteSync).not.toHaveBeenCalled();
  });
});

describe('InsertQueryBuilder — write-triggered sync', () => {
  beforeEach(() => {
    requestWriteSync.mockClear();
  });

  test('a sync-enabled schema requests a write-triggered sync after a successful insert', () => {
    const bridge = makeBridge();
    new InsertQueryBuilder(syncEnabledSchema, bridge).values({ id: 1, name: 'Alice', age: 30 }).execute();

    expect(requestWriteSync).toHaveBeenCalledWith('orders');
    expect(requestWriteSync).toHaveBeenCalledTimes(1);
  });

  test('a schema with no sync block never requests a write-triggered sync', () => {
    const bridge = makeBridge();
    new InsertQueryBuilder(schema, bridge).values({ id: 1, name: 'Alice', age: 30 }).execute();

    expect(requestWriteSync).not.toHaveBeenCalled();
  });

  test('a schema with sync.enabled: false never requests a write-triggered sync', () => {
    const bridge = makeBridge();
    new InsertQueryBuilder(syncDisabledSchema, bridge).values({ id: 1, name: 'Alice', age: 30 }).execute();

    expect(requestWriteSync).not.toHaveBeenCalled();
  });

  test('a batch insert with many rows still requests exactly one write-triggered sync', () => {
    const bridge = makeBridge();
    const rows = Array.from({ length: 10 }, (_, i) => ({ id: i, name: 'x', age: 1 }));
    new InsertQueryBuilder(syncEnabledSchema, bridge).values(rows).execute();

    expect(requestWriteSync).toHaveBeenCalledTimes(1);
  });

  test('repeated execute() calls each ask for a write-triggered sync once', () => {
    const bridge = makeBridge();
    new InsertQueryBuilder(syncEnabledSchema, bridge).values({ id: 1, name: 'Alice' }).execute();
    new InsertQueryBuilder(syncEnabledSchema, bridge).values({ id: 2, name: 'Bob' }).execute();
    new InsertQueryBuilder(syncEnabledSchema, bridge).values({ id: 3, name: 'Carol' }).execute();

    expect(requestWriteSync).toHaveBeenCalledTimes(3);
    expect(requestWriteSync).toHaveBeenNthCalledWith(1, 'orders');
    expect(requestWriteSync).toHaveBeenNthCalledWith(2, 'orders');
    expect(requestWriteSync).toHaveBeenNthCalledWith(3, 'orders');
  });
});
