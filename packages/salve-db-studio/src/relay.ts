import type { WebSocket, WebSocketServer } from 'ws';
import type { ICommandEnvelope, StudioRole } from './types';

/**
 * Brokers messages between exactly one connected app (the running RN app's
 * StudioAgent) and any number of connected browser tabs. Browsers send
 * commands with an `id`; the matching app response is routed back to the
 * browser that asked for it. Unsolicited app pushes (`{ type: 'change', ... }`)
 * are broadcast to every browser.
 */
export class StudioRelay {
  private appSocket: WebSocket | null = null;
  private readonly browserSockets = new Set<WebSocket>();
  private readonly pendingRequests = new Map<string, WebSocket>();

  constructor(wss: WebSocketServer) {
    wss.on('connection', (socket) => this.handleConnection(socket));
  }

  private handleConnection(socket: WebSocket): void {
    let role: StudioRole | null = null;

    socket.on('message', (raw) => {
      const message = StudioRelay.parseJson(raw.toString());
      if (!message) return;

      if (!role) {
        role = this.handleHandshake(socket, message);
        return;
      }

      if (role === 'browser') {
        this.handleBrowserMessage(socket, message);
        return;
      }

      this.handleAppMessage(message);
    });

    socket.on('close', () => {
      if (role === 'app') this.clearAppSocket(socket);
      if (role === 'browser') this.removeBrowserSocket(socket);
    });
  }

  private handleHandshake(socket: WebSocket, message: Record<string, unknown>): StudioRole | null {
    if (message.role !== 'app' && message.role !== 'browser') return null;

    if (message.role === 'app') {
      this.setAppSocket(socket);
    } else {
      this.browserSockets.add(socket);
      socket.send(JSON.stringify({ type: 'appStatus', connected: this.appSocket !== null }));
    }
    return message.role;
  }

  private handleBrowserMessage(socket: WebSocket, message: Record<string, unknown>): void {
    const command = message as ICommandEnvelope;
    if (typeof command.id !== 'string' || typeof command.type !== 'string') return;

    if (!this.appSocket) {
      socket.send(JSON.stringify({ id: command.id, ok: false, error: 'No app connected' }));
      return;
    }

    this.pendingRequests.set(command.id, socket);
    this.appSocket.send(JSON.stringify(message));
  }

  private handleAppMessage(message: Record<string, unknown>): void {
    if (typeof message.id === 'string') {
      const browser = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);
      browser?.send(JSON.stringify(message));
      return;
    }
    // unsolicited push (e.g. { type: 'change', tables }) — fan out to every browser
    this.broadcastToBrowsers(message);
  }

  private setAppSocket(socket: WebSocket): void {
    if (this.appSocket && this.appSocket !== socket) {
      this.appSocket.close();
    }
    this.appSocket = socket;
    this.broadcastToBrowsers({ type: 'appStatus', connected: true });
  }

  private clearAppSocket(socket: WebSocket): void {
    if (this.appSocket !== socket) return;
    this.appSocket = null;
    for (const [id, browser] of this.pendingRequests) {
      browser.send(JSON.stringify({ id, ok: false, error: 'App disconnected' }));
    }
    this.pendingRequests.clear();
    this.broadcastToBrowsers({ type: 'appStatus', connected: false });
  }

  private removeBrowserSocket(socket: WebSocket): void {
    this.browserSockets.delete(socket);
    for (const [id, browser] of this.pendingRequests) {
      if (browser === socket) this.pendingRequests.delete(id);
    }
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
