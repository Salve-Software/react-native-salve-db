/** One command sent by a Studio browser tab, relayed to the app unchanged. */
export interface IStudioCommand {
  id: string;
  type: 'listTables' | 'tableInfo' | 'queryRows' | 'insertRow' | 'updateRow' | 'deleteRow' | 'execute';
  table?: string;
  sql?: string;
  params?: unknown[];
  values?: Record<string, unknown>;
  primaryKey?: string;
  primaryKeyValue?: unknown;
  limit?: number;
  offset?: number;
}
