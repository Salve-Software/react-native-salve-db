import type { SalveDatabase } from '../specs/SalveDatabase.nitro';
import type { IStudioSocket, StudioSocketFactory } from './types';
import { STUDIO_DEFAULT_HOST, STUDIO_DEFAULT_PORT, STUDIO_RECONNECT_DELAY_MS } from './constants';
import { handleCommand, parseStudioCommand, createDefaultStudioSocket } from './library';

/**
 * Dials out to the local `npm run db:studio` dev server (always
 * `ws://localhost:{@link STUDIO_DEFAULT_PORT}`) and serves its commands
 * against `bridge` — table browsing/editing from the browser, live change
 * pushes. `ConfigureDb` starts one automatically whenever `__DEV__` is true.
 */
export class StudioAgent {
  private _socket: IStudioSocket | null = null;
  private _changeSubscriptionId: number | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly _bridge: SalveDatabase) {}

  /** Starts (or restarts) the agent. */
  start(socketFactory: StudioSocketFactory = createDefaultStudioSocket): void {
    this.stop();
    this._connect(socketFactory);
  }

  /** Stops the agent and releases its subscription/socket. */
  stop(): void {
    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
    if (this._changeSubscriptionId !== null) {
      this._bridge.unsubscribeFromChanges(this._changeSubscriptionId);
      this._changeSubscriptionId = null;
    }
    this._socket?.close();
    this._socket = null;
  }

  private _connect(socketFactory: StudioSocketFactory): void {
    const socket = socketFactory(`ws://${STUDIO_DEFAULT_HOST}:${STUDIO_DEFAULT_PORT}`);
    this._socket = socket;

    socket.onopen = () => {
      socket.send(JSON.stringify({ role: 'app' }));
      this._changeSubscriptionId = this._bridge.subscribeToChanges((tables) => {
        socket.send(JSON.stringify({ type: 'change', tables }));
      });
    };

    socket.onmessage = (event) => {
      const command = parseStudioCommand(event.data);
      if (!command) return;
      socket.send(JSON.stringify(handleCommand(this._bridge, command)));
    };

    socket.onclose = () => {
      if (this._changeSubscriptionId !== null) {
        this._bridge.unsubscribeFromChanges(this._changeSubscriptionId);
        this._changeSubscriptionId = null;
      }
      this._reconnectTimer = setTimeout(() => this._connect(socketFactory), STUDIO_RECONNECT_DELAY_MS);
    };

    socket.onerror = () => socket.close();
  }
}
