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
  it('routes a browser command to the app device and the app response back to that browser', async () => {
    const { server, url } = await startRelayServer();
    const app = await connect(url);
    const browser = await connect(url);

    app.send(JSON.stringify({ role: 'app', deviceId: 'ios-1', platform: 'ios', dbName: 'main' }));
    await wait(15);
    const devicesPromise = nextMessage(browser);
    browser.send(JSON.stringify({ role: 'browser' }));
    assert.deepEqual(await devicesPromise, {
      type: 'devices',
      devices: [{ id: 'ios-1', platform: 'ios', dbName: 'main' }],
    });

    const appReceived = nextMessage(app);
    browser.send(JSON.stringify({ id: '1', type: 'listTables', deviceId: 'ios-1' }));
    const forwarded = await appReceived;
    assert.deepEqual(forwarded, { id: '1', type: 'listTables', deviceId: 'ios-1' });

    const browserReceived = nextMessage(browser);
    app.send(JSON.stringify({ id: '1', ok: true, result: [{ name: 'users' }] }));
    const response = await browserReceived;
    assert.deepEqual(response, { id: '1', ok: true, result: [{ name: 'users' }] });

    app.close();
    browser.close();
    server.close();
  });

  it('replies immediately with an error when the target device is not connected', async () => {
    const { server, url } = await startRelayServer();
    const browser = await connect(url);
    browser.send(JSON.stringify({ role: 'browser' }));
    await nextMessage(browser); // devices: []

    const response = nextMessage(browser);
    browser.send(JSON.stringify({ id: '2', type: 'listTables', deviceId: 'unknown' }));
    assert.deepEqual(await response, { id: '2', ok: false, error: 'Device not connected' });

    browser.close();
    server.close();
  });

  it('broadcasts unsolicited app pushes (change events) to every browser, tagged with the device id', async () => {
    const { server, url } = await startRelayServer();
    const app = await connect(url);
    app.send(JSON.stringify({ role: 'app', deviceId: 'ios-1', platform: 'ios', dbName: 'main' }));
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

    assert.deepEqual(await receivedA, { type: 'change', tables: ['users'], deviceId: 'ios-1' });
    assert.deepEqual(await receivedB, { type: 'change', tables: ['users'], deviceId: 'ios-1' });

    app.close();
    browserA.close();
    browserB.close();
    server.close();
  });

  it('tracks multiple devices independently and lets a browser talk to either one', async () => {
    const { server, url } = await startRelayServer();
    const appIos = await connect(url);
    const appAndroid = await connect(url);
    appIos.send(JSON.stringify({ role: 'app', deviceId: 'ios-1', platform: 'ios', dbName: 'main' }));
    appAndroid.send(JSON.stringify({ role: 'app', deviceId: 'android-1', platform: 'android', dbName: 'main' }));
    await wait(15);

    const browser = await connect(url);
    const devicesPromise = nextMessage(browser);
    browser.send(JSON.stringify({ role: 'browser' }));
    const { devices } = (await devicesPromise) as { devices: { id: string }[] };
    assert.deepEqual(
      devices.map((d) => d.id).sort(),
      ['android-1', 'ios-1']
    );

    const androidReceived = nextMessage(appAndroid);
    browser.send(JSON.stringify({ id: '9', type: 'listTables', deviceId: 'android-1' }));
    assert.deepEqual(await androidReceived, { id: '9', type: 'listTables', deviceId: 'android-1' });

    appIos.close();
    appAndroid.close();
    browser.close();
    server.close();
  });

  it('drops the device from the list when it disconnects', async () => {
    const { server, url } = await startRelayServer();
    const app = await connect(url);
    app.send(JSON.stringify({ role: 'app', deviceId: 'ios-1', platform: 'ios', dbName: 'main' }));
    await wait(15);

    const browser = await connect(url);
    browser.send(JSON.stringify({ role: 'browser' }));
    await nextMessage(browser); // devices: [ios-1]

    const devicesAfterClose = nextMessage(browser);
    app.close();
    assert.deepEqual(await devicesAfterClose, { type: 'devices', devices: [] });

    browser.close();
    server.close();
  });
});
