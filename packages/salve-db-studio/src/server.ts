import type { Server } from 'node:http';
import type { Express } from 'express';
import express from 'express';
import path from 'node:path';
import { createServer as createHttpServer } from 'node:http';
import { WebSocketServer } from 'ws';
import { StudioRelay } from './relay';

/** Assembles the HTTP server: static web UI + the app<->browser WebSocket relay. */
export class StudioServer {
  private readonly httpServer: Server;

  constructor() {
    const app: Express = express();
    app.use(express.static(path.join(__dirname, '..', 'public')));

    this.httpServer = createHttpServer(app);
    const wss = new WebSocketServer({ server: this.httpServer });
    new StudioRelay(wss);
  }

  listen(port: number, callback?: () => void): Server {
    return this.httpServer.listen(port, callback);
  }

  close(callback?: (err?: Error) => void): void {
    this.httpServer.close(callback);
  }

  address(): ReturnType<Server['address']> {
    return this.httpServer.address();
  }
}
