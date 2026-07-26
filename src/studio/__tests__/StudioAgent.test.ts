import type { IStudioSocket } from '../types';
import type { SalveDatabase } from '../../specs/SalveDatabase.nitro';
import { StudioAgent } from '../StudioAgent.class';

class FakeSocket implements IStudioSocket {
  sent: unknown[] = [];
  closed = false;
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;

  send(data: string) {
    this.sent.push(JSON.parse(data));
  }

  close() {
    this.closed = true;
  }

  lastSent(): unknown {
    return this.sent[this.sent.length - 1];
  }
}

function makeBridge() {
  let changeCallback: ((tables: string[]) => void) | null = null;
  const bridge = {
    execute: jest.fn(() => ({ columns: [], rows: [] })),
    subscribeToChanges: jest.fn((cb: (tables: string[]) => void) => {
      changeCallback = cb;
      return 1;
    }),
    unsubscribeFromChanges: jest.fn(),
  } as unknown as SalveDatabase;

  return { bridge, fireChange: (tables: string[]) => changeCallback?.(tables) };
}

describe('StudioAgent', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  test('start() always dials ws://localhost:7377 and sends the app handshake on open', () => {
    const { bridge } = makeBridge();
    const sockets: { url: string; socket: FakeSocket }[] = [];
    const factory = (url: string) => {
      const socket = new FakeSocket();
      sockets.push({ url, socket });
      return socket;
    };

    const agent = new StudioAgent(bridge);
    agent.start(factory);
    expect(sockets).toHaveLength(1);
    expect(sockets[0]!.url).toBe('ws://localhost:7377');

    sockets[0]!.socket.onopen?.();
    expect(sockets[0]!.socket.lastSent()).toEqual({ role: 'app' });
    expect(bridge.subscribeToChanges).toHaveBeenCalledTimes(1);

    agent.stop();
  });

  test('forwards subscribeToChanges events to the socket as change pushes', () => {
    const { bridge, fireChange } = makeBridge();
    const socket = new FakeSocket();
    const agent = new StudioAgent(bridge);
    agent.start(() => socket);
    socket.onopen?.();

    fireChange(['users', 'orders']);

    expect(socket.lastSent()).toEqual({ type: 'change', tables: ['users', 'orders'] });
    agent.stop();
  });

  test('stop() closes the socket and unsubscribes', () => {
    const { bridge } = makeBridge();
    const socket = new FakeSocket();
    const agent = new StudioAgent(bridge);
    agent.start(() => socket);
    socket.onopen?.();

    agent.stop();

    expect(socket.closed).toBe(true);
    expect(bridge.unsubscribeFromChanges).toHaveBeenCalledWith(1);
  });

  test('start() again restarts a fresh connection instead of stacking sockets', () => {
    const { bridge } = makeBridge();
    const sockets: FakeSocket[] = [];
    const factory = () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    };

    const agent = new StudioAgent(bridge);
    agent.start(factory);
    sockets[0]!.onopen?.();
    agent.start(factory);

    expect(sockets).toHaveLength(2);
    expect(sockets[0]!.closed).toBe(true);

    agent.stop();
  });

  test('reconnects after the socket closes', () => {
    jest.useFakeTimers();
    const { bridge } = makeBridge();
    const sockets: FakeSocket[] = [];
    const factory = () => {
      const socket = new FakeSocket();
      sockets.push(socket);
      return socket;
    };

    const agent = new StudioAgent(bridge);
    agent.start(factory);
    expect(sockets).toHaveLength(1);

    // simulate the transport dropping (distinct from stop(), the user-driven path)
    sockets[0]!.onclose?.();
    jest.advanceTimersByTime(2000);

    expect(sockets).toHaveLength(2);

    agent.stop();
  });
});
