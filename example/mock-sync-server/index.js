// Local mock server for manually testing Salve DB's sync engine end to end
// (manual Database.sync/syncAll, the app-open trigger, and the native
// connectivity monitor) against a real backend contract, without needing a
// real server. Zero dependencies — plain Node `http`.
//
// Run: npm run mock-sync-server   (from example/)
// It binds to 0.0.0.0:4000 so it's reachable from a simulator/emulator AND
// a real device on the same Wi-Fi network as this machine.
//
// Every request is logged — watch this terminal while testing manual sync,
// backgrounding/foregrounding the app, and toggling airplane mode to see
// each trigger actually reach the "server".

const http = require('http');

const PORT = 4000;
let cursorCounter = 0;

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });
}

const server = http.createServer(async (req, res) => {
  const body = await readBody(req);
  const timestamp = new Date().toISOString();

  if (req.url === '/auth/refresh') {
    console.log(`[${timestamp}] POST /auth/refresh`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' }));
    return;
  }

  if (req.url?.startsWith('/sync/')) {
    cursorCounter += 1;
    console.log(`[${timestamp}] POST ${req.url} — ${body.operations?.length ?? 0} operation(s) pushed, cursor was ${JSON.stringify(body.cursor)}`);
    res.writeHead(200, { 'Content-Type': 'application/json' });
    // No server-side data to push down in this mock — just acknowledges the
    // push and advances the cursor. Edit `operations` below to simulate the
    // server sending rows back down (pull direction).
    res.end(JSON.stringify({ cursor: `c${cursorCounter}`, operations: [], hasMore: false }));
    return;
  }

  console.log(`[${timestamp}] ${req.method} ${req.url} — unhandled`);
  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock sync server listening on http://0.0.0.0:${PORT}`);
  console.log('Point Database.configure({ baseUrl: "http://<this-machine-LAN-IP>:4000", ... }) at it.');
});
