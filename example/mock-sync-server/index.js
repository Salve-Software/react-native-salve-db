// Local mock server for manually testing Salve DB's sync engine end to end
// (manual Database.sync/syncAll, the app-open trigger, and the native
// connectivity monitor) against a real backend contract, without needing a
// real server. Zero dependencies — plain Node `http`.
//
// Run: npm run mock-sync-server   (from example/)
// It binds to 0.0.0.0:4000 so it's reachable from a simulator/emulator AND
// a real device on the same Wi-Fi network as this machine.
//
// State is per-entity and generic — any schema's sync.endpoint.path of the
// form /sync/<entity> is handled without touching this file. Each entity
// tracks:
//   - rows: the last known payload per primaryKey, updated as clients push.
//   - pullQueue: operations waiting to be delivered to the next sync (FIFO,
//     drained up to the request's pageSize per call) — this is what actually
//     exercises the pull direction. Empty until you seed it via POST
//     /admin/seed, since a mock has no independent "someone else" writing to
//     it.
//
// Wire shape for every operation (push and pull — see cpp/sync/SyncQueueReader
// and cpp/sync/SyncOperationApplier):
//   { operation: "insert"|"update"|"delete", entity, primaryKey: "<string>",
//     payload: { ...columns }, updatedAt: <epoch millis number> }
// `primaryKey` must be a JSON string even when the column is an integer —
// the native applier reads it with a strict string getter.

const http = require('http');

const PORT = 4000;

/** @type {Map<string, { rows: Map<string, object>, pullQueue: object[] }>} */
const entities = new Map();

function entityState(entity) {
  let state = entities.get(entity);
  if (!state) {
    state = { rows: new Map(), pullQueue: [] };
    entities.set(entity, state);
  }
  return state;
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => resolve(raw ? JSON.parse(raw) : {}));
  });
}

function sendJson(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(body));
}

function applyPushedOperation(state, op) {
  if (op.operation === 'delete') {
    state.rows.delete(op.primaryKey);
  } else {
    state.rows.set(op.primaryKey, op.payload);
  }
}

function handleSync(entity, body, res) {
  const state = entityState(entity);
  const pushed = Array.isArray(body.operations) ? body.operations : [];

  for (const op of pushed) applyPushedOperation(state, op);

  const pageSize = Number(body.pageSize) > 0 ? Number(body.pageSize) : 20;
  const delivered = state.pullQueue.splice(0, pageSize);

  console.log(
    `[${new Date().toISOString()}] POST /sync/${entity} — ${pushed.length} pushed, ` +
    `${delivered.length} delivered, ${state.pullQueue.length} still queued, cursor was ${JSON.stringify(body.cursor)}`
  );

  sendJson(res, 200, {
    cursor: `c${Date.now()}`,
    operations: delivered,
    hasMore: state.pullQueue.length > 0,
  });
}

function handleAdminSeed(body, res) {
  const { entity, operation = 'insert', primaryKey, payload } = body;
  if (!entity) return sendJson(res, 400, { error: 'entity is required' });
  if (operation !== 'insert' && operation !== 'update' && operation !== 'delete') {
    return sendJson(res, 400, { error: 'operation must be insert, update, or delete' });
  }
  if (operation !== 'delete' && (!payload || typeof payload !== 'object')) {
    return sendJson(res, 400, { error: 'payload is required for insert/update' });
  }
  if (operation !== 'insert' && !primaryKey) {
    return sendJson(res, 400, { error: 'primaryKey is required for update/delete' });
  }

  const updatedAt = Date.now();
  const resolvedPrimaryKey = String(primaryKey ?? updatedAt);
  const resolvedPayload = operation === 'delete'
    ? undefined
    : { id: Number(resolvedPrimaryKey), ...payload, updatedAt: payload?.updatedAt ?? updatedAt };

  const op = { operation, entity, primaryKey: resolvedPrimaryKey, payload: resolvedPayload, updatedAt };

  const state = entityState(entity);
  state.pullQueue.push(op);

  console.log(`[${new Date().toISOString()}] admin seed queued for "${entity}": ${operation} ${resolvedPrimaryKey} (queue depth ${state.pullQueue.length})`);
  sendJson(res, 200, op);
}

function handleAdminRows(entity, res) {
  const state = entityState(entity);
  sendJson(res, 200, { entity, rows: Object.fromEntries(state.rows) });
}

const server = http.createServer(async (req, res) => {
  const body = ['POST'].includes(req.method) ? await readBody(req) : {};
  const timestamp = new Date().toISOString();

  if (req.url === '/auth/refresh') {
    console.log(`[${timestamp}] POST /auth/refresh`);
    sendJson(res, 200, { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' });
    return;
  }

  if (req.url === '/admin/seed' && req.method === 'POST') {
    handleAdminSeed(body, res);
    return;
  }

  const rowsMatch = req.url?.match(/^\/admin\/rows\/(.+)$/);
  if (rowsMatch && req.method === 'GET') {
    handleAdminRows(decodeURIComponent(rowsMatch[1]), res);
    return;
  }

  const syncMatch = req.url?.match(/^\/sync\/(.+)$/);
  if (syncMatch && req.method === 'POST') {
    handleSync(decodeURIComponent(syncMatch[1]), body, res);
    return;
  }

  console.log(`[${timestamp}] ${req.method} ${req.url} — unhandled`);
  res.writeHead(404);
  res.end();
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Mock sync server listening on http://0.0.0.0:${PORT}`);
  console.log('Point Database.configure({ baseUrl: "http://<this-machine-LAN-IP>:4000", ... }) at it.');
  console.log('Seed a pull-direction change: curl -X POST localhost:4000/admin/seed -H "Content-Type: application/json" -d \'{"entity":"sync_test_notes","operation":"insert","payload":{"body":"from server","pinned":false}}\'');
});
