import type { IColumnInfo, IDevice, Row } from '../../types';
import type { IPendingHandlers, IStudioConnection } from './types';
import { useCallback, useEffect, useRef, useState } from 'react';
import { primaryKeyColumn } from './library';

/** Owns the WebSocket connection to the local Studio server and exposes device/table browsing/editing as plain state + actions. */
export function useStudioConnection(): IStudioConnection {
  const wsRef = useRef<WebSocket | null>(null);
  const pendingRef = useRef(new Map<string, IPendingHandlers>());
  const nextIdRef = useRef(1);
  const selectedDeviceIdRef = useRef<string | null>(null);

  const [devices, setDevices] = useState<IDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string | null>(null);
  const [tables, setTables] = useState<string[]>([]);
  const [currentTable, setCurrentTable] = useState<string | null>(null);
  const [columns, setColumns] = useState<IColumnInfo[]>([]);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);

  const send = useCallback((type: string, payload: Record<string, unknown> = {}): Promise<unknown> => {
    return new Promise((resolve, reject) => {
      const deviceId = selectedDeviceIdRef.current;
      if (!wsRef.current || !deviceId) {
        reject(new Error('No device selected'));
        return;
      }
      const id = String(nextIdRef.current++);
      pendingRef.current.set(id, { resolve, reject });
      wsRef.current.send(JSON.stringify({ id, type, deviceId, ...payload }));
    });
  }, []);

  const loadTables = useCallback(() => {
    send('listTables')
      .then((result) => setTables((result as { name: string }[]).map((r) => r.name)))
      .catch((err: Error) => setError(err.message));
  }, [send]);

  const loadRows = useCallback((table: string) => {
    send('queryRows', { table })
      .then((result) => setRows(result as Row[]))
      .catch((err: Error) => setError(err.message));
  }, [send]);

  const resetTableState = useCallback(() => {
    setCurrentTable(null);
    setColumns([]);
    setRows([]);
    setTables([]);
  }, []);

  const selectDevice = useCallback((id: string) => {
    selectedDeviceIdRef.current = id;
    setSelectedDeviceId(id);
    resetTableState();
    loadTables();
  }, [loadTables, resetTableState]);

  const selectTable = useCallback((name: string) => {
    setCurrentTable(name);
    send('tableInfo', { table: name })
      .then((result) => {
        setColumns(result as IColumnInfo[]);
        loadRows(name);
      })
      .catch((err: Error) => setError(err.message));
  }, [send, loadRows]);

  const refresh = useCallback(() => {
    if (currentTable) loadRows(currentTable);
  }, [currentTable, loadRows]);

  const insertRow = useCallback((values: Record<string, string>): Promise<void> => {
    if (!currentTable) return Promise.resolve();
    return send('insertRow', { table: currentTable, values })
      .then(() => loadRows(currentTable))
      .catch((err: Error) => setError(err.message));
  }, [currentTable, send, loadRows]);

  const updateCell = useCallback((row: Row, column: string, value: string): Promise<void> => {
    if (!currentTable) return Promise.resolve();
    const pk = primaryKeyColumn(columns);
    if (!pk) {
      setError('Table has no primary key — editing is disabled');
      return Promise.resolve();
    }
    return send('updateRow', {
      table: currentTable,
      primaryKey: pk,
      primaryKeyValue: row[pk],
      values: { [column]: value },
    })
      .then(() => loadRows(currentTable))
      .catch((err: Error) => setError(err.message));
  }, [currentTable, columns, send, loadRows]);

  const deleteRow = useCallback((row: Row): Promise<void> => {
    if (!currentTable) return Promise.resolve();
    const pk = primaryKeyColumn(columns);
    if (!pk) {
      setError('Table has no primary key — deleting is disabled');
      return Promise.resolve();
    }
    return send('deleteRow', { table: currentTable, primaryKey: pk, primaryKeyValue: row[pk] })
      .then(() => loadRows(currentTable))
      .catch((err: Error) => setError(err.message));
  }, [currentTable, columns, send, loadRows]);

  const runSql = useCallback((sql: string): Promise<Row[]> => {
    return send('execute', { sql }).then((result) => result as Row[]);
  }, [send]);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect(): void {
      const ws = new WebSocket(`ws://${location.host}`);
      wsRef.current = ws;

      ws.onopen = () => ws.send(JSON.stringify({ role: 'browser' }));

      ws.onmessage = (event) => {
        const message = JSON.parse(event.data as string);

        if (message.type === 'devices') {
          const list = message.devices as IDevice[];
          setDevices(list);

          const stillPresent = list.some((device) => device.id === selectedDeviceIdRef.current);
          if (!stillPresent) {
            const next = list[0]?.id ?? null;
            selectedDeviceIdRef.current = next;
            setSelectedDeviceId(next);
            resetTableState();
            if (next) loadTables();
          }
          return;
        }

        if (message.type === 'change') {
          if (message.deviceId !== selectedDeviceIdRef.current) return;
          setCurrentTable((current) => {
            if (current && message.tables.includes(current)) loadRows(current);
            return current;
          });
          return;
        }

        if (typeof message.id === 'string' && pendingRef.current.has(message.id)) {
          const handlers = pendingRef.current.get(message.id)!;
          pendingRef.current.delete(message.id);
          if (message.ok) handlers.resolve(message.result);
          else handlers.reject(new Error(message.error));
        }
      };

      ws.onclose = () => {
        selectedDeviceIdRef.current = null;
        setSelectedDeviceId(null);
        setDevices([]);
        resetTableState();
        if (!cancelled) reconnectTimer = setTimeout(connect, 1500);
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [loadTables, loadRows, resetTableState]);

  return {
    appConnected: devices.length > 0,
    devices,
    selectedDeviceId,
    selectDevice,
    tables,
    currentTable,
    columns,
    rows,
    error,
    clearError,
    selectTable,
    refresh,
    insertRow,
    updateCell,
    deleteRow,
    runSql,
  };
}
