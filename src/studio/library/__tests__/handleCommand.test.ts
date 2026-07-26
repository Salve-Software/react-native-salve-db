import { handleCommand } from '../handleCommand';
import type { SalveDatabase } from '../../../specs/SalveDatabase.nitro';
import type { QueryResult } from '../../../specs/types';

function makeBridge(rows: Record<string, QueryResult> = {}) {
  return {
    execute: jest.fn((sql: string) => rows[sql] ?? { columns: [], rows: [] }),
  } as unknown as SalveDatabase;
}

describe('handleCommand', () => {
  test('listTables queries sqlite_master', () => {
    const bridge = makeBridge({
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name": {
        columns: ['name'],
        rows: [['users']],
      },
    });

    const response = handleCommand(bridge, { id: '1', type: 'listTables' });

    expect(response).toEqual({ id: '1', ok: true, result: [{ name: 'users' }] });
  });

  test('tableInfo runs PRAGMA table_info for the given table', () => {
    const bridge = makeBridge({
      'PRAGMA table_info("users")': { columns: ['name'], rows: [['id']] },
    });

    const response = handleCommand(bridge, { id: '2', type: 'tableInfo', table: 'users' });

    expect(response).toEqual({ id: '2', ok: true, result: [{ name: 'id' }] });
  });

  test('insertRow builds a parametrized INSERT and quotes identifiers', () => {
    const bridge = makeBridge();

    const response = handleCommand(bridge, {
      id: '3',
      type: 'insertRow',
      table: 'users',
      values: { name: 'Ana', age: 30 },
    });

    expect(bridge.execute).toHaveBeenCalledWith(
      'INSERT INTO "users" ("name", "age") VALUES (?, ?)',
      ['Ana', 30]
    );
    expect(response).toEqual({ id: '3', ok: true, result: { inserted: true } });
  });

  test('updateRow builds a parametrized UPDATE keyed by primaryKey', () => {
    const bridge = makeBridge();

    handleCommand(bridge, {
      id: '4',
      type: 'updateRow',
      table: 'users',
      primaryKey: 'id',
      primaryKeyValue: 1,
      values: { name: 'Bruno' },
    });

    expect(bridge.execute).toHaveBeenCalledWith(
      'UPDATE "users" SET "name" = ? WHERE "id" = ?',
      ['Bruno', 1]
    );
  });

  test('deleteRow builds a parametrized DELETE keyed by primaryKey', () => {
    const bridge = makeBridge();

    handleCommand(bridge, { id: '5', type: 'deleteRow', table: 'users', primaryKey: 'id', primaryKeyValue: 7 });

    expect(bridge.execute).toHaveBeenCalledWith('DELETE FROM "users" WHERE "id" = ?', [7]);
  });

  test('execute runs raw SQL as an escape hatch', () => {
    const bridge = makeBridge({ 'SELECT COUNT(*) AS total FROM users': { columns: ['total'], rows: [[3]] } });

    const response = handleCommand(bridge, { id: '6', type: 'execute', sql: 'SELECT COUNT(*) AS total FROM users' });

    expect(response).toEqual({ id: '6', ok: true, result: [{ total: 3 }] });
  });

  test('truncateTable deletes every row from the table', () => {
    const bridge = makeBridge();

    const response = handleCommand(bridge, { id: '9', type: 'truncateTable', table: 'users' });

    expect(bridge.execute).toHaveBeenCalledWith('DELETE FROM "users"', []);
    expect(response).toEqual({ id: '9', ok: true, result: { truncated: true } });
  });

  test('dropTable drops a regular table', () => {
    const bridge = makeBridge();

    const response = handleCommand(bridge, { id: '10', type: 'dropTable', table: 'users' });

    expect(bridge.execute).toHaveBeenCalledWith('DROP TABLE "users"', []);
    expect(response).toEqual({ id: '10', ok: true, result: { dropped: true } });
  });

  test('dropTable refuses to drop an internal (_-prefixed) table', () => {
    const bridge = makeBridge();

    const response = handleCommand(bridge, { id: '11', type: 'dropTable', table: '_salve_relations' });

    expect(response).toEqual({
      id: '11',
      ok: false,
      error: expect.stringContaining('can only be truncated'),
    });
    expect(bridge.execute).not.toHaveBeenCalled();
  });

  test('rejects a table name that is not a valid identifier', () => {
    const bridge = makeBridge();

    const response = handleCommand(bridge, { id: '7', type: 'tableInfo', table: 'users; DROP TABLE users' });

    expect(response).toEqual({ id: '7', ok: false, error: expect.stringContaining('invalid table') });
    expect(bridge.execute).not.toHaveBeenCalled();
  });

  test('rejects an unknown command type', () => {
    const bridge = makeBridge();

    const response = handleCommand(bridge, { id: '8', type: 'boom' as never });

    expect(response).toEqual({ id: '8', ok: false, error: expect.stringContaining('unknown command type') });
  });
});
