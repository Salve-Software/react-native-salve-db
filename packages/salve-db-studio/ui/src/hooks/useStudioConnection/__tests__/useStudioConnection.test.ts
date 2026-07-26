import { renderHook, act, waitFor } from '@testing-library/react';
import { useStudioConnection } from '../index';

interface ISentCommand {
  id?: string;
  type?: string;
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

  it('flips appConnected and loads tables when appStatus arrives', async () => {
    const { result } = renderHook(() => useStudioConnection());
    const socket = latestSocket();
    act(() => socket.onopen?.());

    act(() => socket.emit({ type: 'appStatus', connected: true }));
    expect(result.current.appConnected).toBe(true);

    const listTables = socket.findSent('listTables');
    act(() => socket.emit({ id: listTables.id, ok: true, result: [{ name: 'users' }] }));

    await waitFor(() => expect(result.current.tables).toEqual(['users']));
  });

  it('selectTable fetches tableInfo then queryRows and populates state', async () => {
    const { result } = renderHook(() => useStudioConnection());
    const socket = latestSocket();
    act(() => socket.onopen?.());
    act(() => socket.emit({ type: 'appStatus', connected: true }));
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
    act(() => socket.emit({ type: 'appStatus', connected: true }));

    const listTables = socket.findSent('listTables');
    act(() => socket.emit({ id: listTables.id, ok: false, error: 'boom' }));

    await waitFor(() => expect(result.current.error).toBe('boom'));
  });

  it('clearError resets the error to null', async () => {
    const { result } = renderHook(() => useStudioConnection());
    const socket = latestSocket();
    act(() => socket.onopen?.());
    act(() => socket.emit({ type: 'appStatus', connected: true }));
    act(() => socket.emit({ id: socket.findSent('listTables').id, ok: false, error: 'boom' }));
    await waitFor(() => expect(result.current.error).toBe('boom'));

    act(() => result.current.clearError());

    expect(result.current.error).toBeNull();
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
