import { renderHook, act, waitFor } from '@testing-library/react';
import { useStudioConnection } from '../index';

interface ISentCommand {
  id?: string;
  type?: string;
  deviceId?: string;
  [key: string]: unknown;
}

class FakeWebSocket {
  static instances: FakeWebSocket[] = [];
  sent: ISentCommand[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  constructor(public url: string) {
    FakeWebSocket.instances.push(this);
  }

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.onclose?.();
  }

  emit(message: unknown) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }

  findSent(type: string): ISentCommand {
    const command = this.sent.find((m) => m.type === type);
    if (!command) throw new Error(`No "${type}" command was sent`);
    return command;
  }
}

function latestSocket(): FakeWebSocket {
  return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!;
}

const oneDevice = [{ id: 'ios-1', platform: 'ios', dbName: 'main' }];

beforeEach(() => {
  FakeWebSocket.instances = [];
  vi.stubGlobal('WebSocket', FakeWebSocket);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('useStudioConnection', () => {
  it('sends the browser handshake on open', () => {
    renderHook(() => useStudioConnection());
    const socket = latestSocket();

    act(() => socket.onopen?.());

    expect(socket.sent[0]).toEqual({ role: 'browser' });
  });

  it('auto-selects the first device and loads tables when devices arrive', async () => {
    const { result } = renderHook(() => useStudioConnection());
    const socket = latestSocket();
    act(() => socket.onopen?.());

    act(() => socket.emit({ type: 'devices', devices: oneDevice }));
    expect(result.current.appConnected).toBe(true);
    expect(result.current.selectedDeviceId).toBe('ios-1');

    const listTables = socket.findSent('listTables');
    expect(listTables.deviceId).toBe('ios-1');
    act(() => socket.emit({ id: listTables.id, ok: true, result: [{ name: 'users' }] }));

    await waitFor(() => expect(result.current.tables).toEqual(['users']));
  });

  it('selectDevice switches the active device and reloads its tables', async () => {
    const twoDevices = [...oneDevice, { id: 'android-1', platform: 'android', dbName: 'main' }];
    const { result } = renderHook(() => useStudioConnection());
    const socket = latestSocket();
    act(() => socket.onopen?.());
    act(() => socket.emit({ type: 'devices', devices: twoDevices }));
    act(() => socket.emit({ id: socket.findSent('listTables').id, ok: true, result: [] }));

    act(() => result.current.selectDevice('android-1'));

    expect(result.current.selectedDeviceId).toBe('android-1');
    const listTables = socket.sent.filter((m) => m.type === 'listTables');
    expect(listTables[listTables.length - 1]!.deviceId).toBe('android-1');
  });

  it('ignores a change push targeting a device that is not currently selected', async () => {
    const twoDevices = [...oneDevice, { id: 'android-1', platform: 'android', dbName: 'main' }];
    const { result } = renderHook(() => useStudioConnection());
    const socket = latestSocket();
    act(() => socket.onopen?.());
    act(() => socket.emit({ type: 'devices', devices: twoDevices }));
    act(() => socket.emit({ id: socket.findSent('listTables').id, ok: true, result: [] }));
    act(() => result.current.selectTable('users'));
    act(() =>
      socket.emit({
        id: socket.findSent('tableInfo').id,
        ok: true,
        result: [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 }],
      })
    );
    await waitFor(() => expect(result.current.columns).toHaveLength(1));
    act(() => socket.emit({ id: socket.findSent('queryRows').id, ok: true, result: [{ id: 1 }] }));
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 1 }]));

    const sentBefore = socket.sent.length;
    act(() => socket.emit({ type: 'change', deviceId: 'android-1', tables: ['users'] }));

    expect(socket.sent.length).toBe(sentBefore);
  });

  it('selectTable fetches tableInfo then queryRows and populates state', async () => {
    const { result } = renderHook(() => useStudioConnection());
    const socket = latestSocket();
    act(() => socket.onopen?.());
    act(() => socket.emit({ type: 'devices', devices: oneDevice }));
    act(() => socket.emit({ id: socket.findSent('listTables').id, ok: true, result: [] }));

    act(() => result.current.selectTable('users'));

    const tableInfo = socket.findSent('tableInfo');
    expect(tableInfo.table).toBe('users');
    act(() =>
      socket.emit({
        id: tableInfo.id,
        ok: true,
        result: [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 }],
      })
    );
    await waitFor(() => expect(result.current.columns).toHaveLength(1));

    const queryRows = socket.findSent('queryRows');
    act(() => socket.emit({ id: queryRows.id, ok: true, result: [{ id: 1 }] }));

    await waitFor(() => expect(result.current.rows).toEqual([{ id: 1 }]));
  });

  it('surfaces a command failure as an error', async () => {
    const { result } = renderHook(() => useStudioConnection());
    const socket = latestSocket();
    act(() => socket.onopen?.());
    act(() => socket.emit({ type: 'devices', devices: oneDevice }));

    const listTables = socket.findSent('listTables');
    act(() => socket.emit({ id: listTables.id, ok: false, error: 'boom' }));

    await waitFor(() => expect(result.current.error).toBe('boom'));
  });

  it('clearError resets the error to null', async () => {
    const { result } = renderHook(() => useStudioConnection());
    const socket = latestSocket();
    act(() => socket.onopen?.());
    act(() => socket.emit({ type: 'devices', devices: oneDevice }));
    act(() => socket.emit({ id: socket.findSent('listTables').id, ok: false, error: 'boom' }));
    await waitFor(() => expect(result.current.error).toBe('boom'));

    act(() => result.current.clearError());

    expect(result.current.error).toBeNull();
  });

  it('truncateTable sends truncateTable and reloads rows for the truncated table', async () => {
    const { result } = renderHook(() => useStudioConnection());
    const socket = latestSocket();
    act(() => socket.onopen?.());
    act(() => socket.emit({ type: 'devices', devices: oneDevice }));
    act(() => socket.emit({ id: socket.findSent('listTables').id, ok: true, result: [{ name: 'users' }] }));
    act(() => result.current.selectTable('users'));
    act(() =>
      socket.emit({
        id: socket.findSent('tableInfo').id,
        ok: true,
        result: [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 }],
      })
    );
    await waitFor(() => expect(result.current.columns).toHaveLength(1));
    act(() => socket.emit({ id: socket.findSent('queryRows').id, ok: true, result: [{ id: 1 }] }));
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 1 }]));

    act(() => {
      result.current.truncateTable('users');
    });

    const truncateCommand = socket.findSent('truncateTable');
    expect(truncateCommand.table).toBe('users');
    act(() => socket.emit({ id: truncateCommand.id, ok: true, result: { truncated: true } }));

    await waitFor(() => expect(socket.sent.filter((m) => m.type === 'queryRows')).toHaveLength(2));
    const queryRowsCalls = socket.sent.filter((m) => m.type === 'queryRows');
    act(() => socket.emit({ id: queryRowsCalls[queryRowsCalls.length - 1]!.id, ok: true, result: [] }));
    await waitFor(() => expect(result.current.rows).toEqual([]));
  });

  it('deleteTable sends dropTable, clears the current table, and reloads the table list', async () => {
    const { result } = renderHook(() => useStudioConnection());
    const socket = latestSocket();
    act(() => socket.onopen?.());
    act(() => socket.emit({ type: 'devices', devices: oneDevice }));
    act(() => socket.emit({ id: socket.findSent('listTables').id, ok: true, result: [{ name: 'users' }] }));
    act(() => result.current.selectTable('users'));
    act(() =>
      socket.emit({
        id: socket.findSent('tableInfo').id,
        ok: true,
        result: [{ cid: 0, name: 'id', type: 'INTEGER', notnull: 0, dflt_value: null, pk: 1 }],
      })
    );
    await waitFor(() => expect(result.current.columns).toHaveLength(1));
    act(() => socket.emit({ id: socket.findSent('queryRows').id, ok: true, result: [{ id: 1 }] }));
    await waitFor(() => expect(result.current.rows).toEqual([{ id: 1 }]));

    act(() => {
      result.current.deleteTable('users');
    });

    const dropCommand = socket.findSent('dropTable');
    expect(dropCommand.table).toBe('users');
    act(() => socket.emit({ id: dropCommand.id, ok: true, result: { dropped: true } }));
    await waitFor(() => expect(result.current.currentTable).toBeNull());
    expect(result.current.columns).toEqual([]);
    expect(result.current.rows).toEqual([]);

    const listTablesCalls = socket.sent.filter((m) => m.type === 'listTables');
    act(() =>
      socket.emit({ id: listTablesCalls[listTablesCalls.length - 1]!.id, ok: true, result: [] })
    );
    await waitFor(() => expect(result.current.tables).toEqual([]));
  });

  it('reconnects after the socket closes', () => {
    vi.useFakeTimers();
    renderHook(() => useStudioConnection());
    expect(FakeWebSocket.instances).toHaveLength(1);

    act(() => FakeWebSocket.instances[0]!.onclose?.());
    act(() => vi.advanceTimersByTime(1500));

    expect(FakeWebSocket.instances).toHaveLength(2);
  });
});
