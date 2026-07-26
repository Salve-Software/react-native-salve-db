import type { WebSocket, WebSocketServer } from 'ws';
import type { ICommandEnvelope, IStudioDevice, StudioRole } from './types';

interface IAppEntry {
  socket: WebSocket;
  platform: string;
  dbName: string;
}

/**
 * Brokers messages between any number of connected apps (each a running RN app's
 * StudioAgent, identified by its `deviceId`) and any number of connected browser
 * tabs. Browsers send commands with an `id` and a `deviceId` naming which app to
 * talk to; the matching app response is routed back to the browser that asked
 * for it. Unsolicited app pushes (`{ type: 'change', ... }`) are broadcast to
 * every browser, tagged with the source `deviceId`.
 */
export class StudioRelay {
  private readonly apps = new Map<string, IAppEntry>();
  private readonly browserSockets = new Set<WebSocket>();
  private readonly pendingRequests = new Map<string, WebSocket>();

  constructor(wss: WebSocketServer) {
    wss.on('connection', (socket) => this.handleConnection(socket));
  }

  private handleConnection(socket: WebSocket): void {
    let role: StudioRole | null = null;
    let deviceId: string | null = null;

    socket.on('message', (raw) => {
      const message = StudioRelay.parseJson(raw.toString());
      if (!message) return;

      if (!role) {
        const handshake = this.handleHandshake(socket, message);
        role = handshake?.role ?? null;
        deviceId = handshake?.deviceId ?? null;
        return;
      }

      if (role === 'browser') {
        this.handleBrowserMessage(socket, message);
        return;
      }

      if (deviceId) this.handleAppMessage(deviceId, message);
    });

    socket.on('close', () => {
      if (role === 'app' && deviceId) this.clearAppSocket(deviceId, socket);
      if (role === 'browser') this.removeBrowserSocket(socket);
    });
  }

  private handleHandshake(
    socket: WebSocket,
    message: Record<string, unknown>
  ): { role: StudioRole; deviceId: string | null } | null {
    if (message.role !== 'app' && message.role !== 'browser') return null;

    if (message.role === 'app') {
      const deviceId = String(message.deviceId ?? '');
      if (!deviceId) return null;
      this.setAppSocket(deviceId, socket, String(message.platform ?? ''), String(message.dbName ?? ''));
      return { role: 'app', deviceId };
    }

    this.browserSockets.add(socket);
    socket.send(JSON.stringify({ type: 'devices', devices: this.listDevices() }));
    return { role: 'browser', deviceId: null };
  }

  private handleBrowserMessage(socket: WebSocket, message: Record<string, unknown>): void {
    const command = message as ICommandEnvelope;
    if (typeof command.id !== 'string' || typeof command.type !== 'string') return;

    const app = typeof command.deviceId === 'string' ? this.apps.get(command.deviceId) : undefined;
    if (!app) {
      socket.send(JSON.stringify({ id: command.id, ok: false, error: 'Device not connected' }));
      return;
    }

    this.pendingRequests.set(command.id, socket);
    app.socket.send(JSON.stringify(message));
  }

  private handleAppMessage(deviceId: string, message: Record<string, unknown>): void {
    if (typeof message.id === 'string') {
      const browser = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      browser?.send(JSON.stringify(message));
      return;
    }
    // unsolicited push (e.g. { type: 'change', tables }) — fan out to every browser, tagged with its source device
    this.broadcastToBrowsers({ ...message, deviceId });
  }

  private setAppSocket(deviceId: string, socket: WebSocket, platform: string, dbName: string): void {
    this.apps.get(deviceId)?.socket.close();
    this.apps.set(deviceId, { socket, platform, dbName });
    this.broadcastDevices();
  }

  private clearAppSocket(deviceId: string, socket: WebSocket): void {
    if (this.apps.get(deviceId)?.socket !== socket) return;
    this.apps.delete(deviceId);
    for (const [id, browser] of this.pendingRequests) {
      browser.send(JSON.stringify({ id, ok: false, error: 'Device disconnected' }));
    }
    this.pendingRequests.clear();
    this.broadcastDevices();
  }

  private removeBrowserSocket(socket: WebSocket): void {
    this.browserSockets.delete(socket);
    for (const [id, browser] of this.pendingRequests) {
      if (browser === socket) this.pendingRequests.delete(id);
    }
  }

  private listDevices(): IStudioDevice[] {
    return [...this.apps.entries()].map(([id, entry]) => ({
      id,
      platform: entry.platform,
      dbName: entry.dbName,
    }));
  }

  private broadcastDevices(): void {
    this.broadcastToBrowsers({ type: 'devices', devices: this.listDevices() });
  }

  private broadcastToBrowsers(payload: unknown): void {
    const data = JSON.stringify(payload);
    for (const socket of this.browserSockets) {
      socket.send(data);
    }
  }

  private static parseJson(text: string): Record<string, unknown> | null {
    try {
      const parsed = JSON.parse(text);
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}
