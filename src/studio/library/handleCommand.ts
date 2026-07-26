import type { SalveDatabase } from '../../specs/SalveDatabase.nitro';
import type { SqlValue } from '../../specs/types';
import type { IStudioCommand, IStudioResponse } from '../types';
import { mapQueryResultToRows } from '../../database/classes/QueryDb/library';
import { assertIdentifier } from './assertIdentifier';

/** Runs one Studio command against the bridge and returns the response to send back over the socket. */
export function handleCommand(bridge: SalveDatabase, command: IStudioCommand): IStudioResponse {
  try {
    return { id: command.id, ok: true, result: runCommand(bridge, command) };
  } catch (err) {
    return { id: command.id, ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

function runCommand(bridge: SalveDatabase, command: IStudioCommand): unknown {
  switch (command.type) {
    case 'listTables':
      return execRows(
        bridge,
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
      );

    case 'tableInfo':
      assertIdentifier(command.table, 'table');
      return execRows(bridge, `PRAGMA table_info("${command.table}")`);

    case 'queryRows': {
      assertIdentifier(command.table, 'table');
      const limit = Number.isFinite(command.limit) ? Number(command.limit) : 200;
      const offset = Number.isFinite(command.offset) ? Number(command.offset) : 0;
      return execRows(bridge, `SELECT * FROM "${command.table}" LIMIT ? OFFSET ?`, [limit, offset]);
    }

    case 'insertRow': {
      assertIdentifier(command.table, 'table');
      const values = command.values ?? {};
      const columns = Object.keys(values);
      columns.forEach((col) => assertIdentifier(col, 'column'));
      const placeholders = columns.map(() => '?').join(', ');
      const columnList = columns.map((col) => `"${col}"`).join(', ');
      execRows(bridge, `INSERT INTO "${command.table}" (${columnList}) VALUES (${placeholders})`, Object.values(values));
      return { inserted: true };
    }

    case 'updateRow': {
      assertIdentifier(command.table, 'table');
      assertIdentifier(command.primaryKey, 'primaryKey');
      const values = command.values ?? {};
      const columns = Object.keys(values);
      columns.forEach((col) => assertIdentifier(col, 'column'));
      const assignments = columns.map((col) => `"${col}" = ?`).join(', ');
      execRows(
        bridge,
        `UPDATE "${command.table}" SET ${assignments} WHERE "${command.primaryKey}" = ?`,
        [...Object.values(values), command.primaryKeyValue]
      );
      return { updated: true };
    }

    case 'deleteRow':
      assertIdentifier(command.table, 'table');
      assertIdentifier(command.primaryKey, 'primaryKey');
      execRows(bridge, `DELETE FROM "${command.table}" WHERE "${command.primaryKey}" = ?`, [command.primaryKeyValue]);
      return { deleted: true };

    case 'execute':
      if (!command.sql) throw new Error('Studio: execute requires sql');
      return execRows(bridge, command.sql, command.params);

    default:
      throw new Error(`Studio: unknown command type "${(command as { type: string }).type}"`);
  }
}

function execRows(bridge: SalveDatabase, sql: string, params?: unknown[]): Record<string, unknown>[] {
  return mapQueryResultToRows(bridge.execute(sql, (params ?? []) as SqlValue[]));
}
