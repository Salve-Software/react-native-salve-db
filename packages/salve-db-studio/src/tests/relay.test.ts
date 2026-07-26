import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer as createHttpServer, type Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { StudioRelay } from '../relay';

function startRelayServer(): Promise<{ server: Server; url: string }> {
  return new Promise((resolve) => {
    const server = createHttpServer();
    new StudioRelay(new WebSocketServer({ server }));
    server.listen(0, () => {
      const { port } = server.address() as { port: number };
      resolve({ server, url: `ws://localhost:${port}` });
    });
  });
}

function connect(url: string): Promise<WebSocket> {
  return new Promise((resolve) => {
    const socket = new WebSocket(url);
    socket.once('open', () => resolve(socket));
  });
}

function nextMessage(socket: WebSocket): Promise<unknown> {
  return new Promise((resolve) => {
    socket.once('message', (raw) => resolve(JSON.parse(raw.toString())));
  });
}

/** Handshakes send no ack; give the server a tick to register the role before the next step relies on it. */
function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('StudioRelay', () => {
  it('routes a browser command to the app and the app response back to that browser', async () => {
    const { server, url } = await startRelayServer();
    const app = await connect(url);
    const browser = await connect(url);

    app.send(JSON.stringify({ role: 'app' }));
    await wait(15);
    const appStatusPromise = nextMessage(browser);
    browser.send(JSON.stringify({ role: 'browser' }));
    const appStatus = await appStatusPromise;
    assert.deepEqual(appStatus, { type: 'appStatus', connected: true });

    const appReceived = nextMessage(app);
    browser.send(JSON.stringify({ id: '1', type: 'listTables' }));
    const forwarded = await appReceived;
    assert.deepEqual(forwarded, { id: '1', type: 'listTables' });

    const browserReceived = nextMessage(browser);
    app.send(JSON.stringify({ id: '1', ok: true, result: [{ name: 'users' }] }));
    const response = await browserReceived;
    assert.deepEqual(response, { id: '1', ok: true, result: [{ name: 'users' }] });

    app.close();
    browser.close();
    server.close();
  });

  it('replies immediately with an error when no app is connected', async () => {
    const { server, url } = await startRelayServer();
    const browser = await connect(url);
    browser.send(JSON.stringify({ role: 'browser' }));
    await nextMessage(browser); // appStatus: connected false

    const response = nextMessage(browser);
    browser.send(JSON.stringify({ id: '2', type: 'listTables' }));
    assert.deepEqual(await response, { id: '2', ok: false, error: 'No app connected' });

    browser.close();
    server.close();
  });

  it('broadcasts unsolicited app pushes (change events) to every browser', async () => {
    const { server, url } = await startRelayServer();
    const app = await connect(url);
    app.send(JSON.stringify({ role: 'app' }));
    await wait(15);

    const browserA = await connect(url);
    browserA.send(JSON.stringify({ role: 'browser' }));
    await nextMessage(browserA);
    const browserB = await connect(url);
    browserB.send(JSON.stringify({ role: 'browser' }));
    await nextMessage(browserB);

    const receivedA = nextMessage(browserA);
    const receivedB = nextMessage(browserB);
    app.send(JSON.stringify({ type: 'change', tables: ['users'] }));

    assert.deepEqual(await receivedA, { type: 'change', tables: ['users'] });
    assert.deepEqual(await receivedB, { type: 'change', tables: ['users'] });

    app.close();
    browserA.close();
    browserB.close();
    server.close();
  });
});
