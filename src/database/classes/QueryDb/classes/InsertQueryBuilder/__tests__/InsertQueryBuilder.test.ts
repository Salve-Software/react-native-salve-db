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
    execute: jest.fn().mockReturnValue({ columns: [], rows: [] }),
  } as unknown as SalveDatabase;
}

function executedWith(bridge: SalveDatabase) {
  return (bridge.execute as jest.Mock).mock.calls[0] as [string, unknown[]];
}

describe('InsertQueryBuilder', () => {
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
    expect(() => new InsertQueryBuilder(schema, bridge).execute()).toThrow(
      'InsertQueryBuilder: call .values() before .execute()'
    );
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
      new InsertQueryBuilder(schema, bridge)
        .values([{ id: 1, name: 'Alice', age: 30 }, { id: 2, name: 'Bob' }])
        .execute()
    ).toThrow('InsertQueryBuilder: every row passed to .values() must have the same set of columns');
  });

  test('throws if batch exceeds MAX_BATCH_INSERT_ROWS', () => {
    const bridge = makeBridge();
    const rows = Array.from({ length: 501 }, (_, i) => ({ id: i, name: 'x' }));
    expect(() => new InsertQueryBuilder(schema, bridge).values(rows).execute()).toThrow(
      /exceeds MAX_BATCH_INSERT_ROWS/
    );
  });

  test('throws if batch is within MAX_BATCH_INSERT_ROWS but exceeds SQLITE_MAX_BOUND_PARAMS', () => {
    const bridge = makeBridge();
    const rows = Array.from({ length: 400 }, (_, i) => ({ id: i, name: 'x', age: 1 }));
    expect(() => new InsertQueryBuilder(schema, bridge).values(rows).execute()).toThrow(
      /exceeds SQLITE_MAX_BOUND_PARAMS/
    );
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
      new InsertQueryBuilder(schema, bridge).values({ id: 1 } as never).onConflictDoUpdate().execute()
    ).toThrow('InsertQueryBuilder: onConflictDoUpdate() requires at least one non-primary-key column');
  });
});
