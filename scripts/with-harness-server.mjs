#!/usr/bin/env node
import { spawn } from 'node:child_process';

const command = process.argv.slice(2).join(' ');
if (!command) {
  console.error('Usage: node scripts/with-harness-server.mjs "<command to run>"');
  process.exit(1);
}

const READY_URL = 'http://localhost:4000/users';
const READY_TIMEOUT_MS = 30000;
const STOP_TIMEOUT_MS = 5000;

// `detached: true` puts the spawned `sh -c "npm run ..."` in its own process
// group. Stopping via that whole group (negative PID) also reaches the
// grandchild `tsx src/index.ts` process underneath `npm run start:pglite` —
// a plain `server.kill()` only signals the shell wrapper, leaving the real
// server orphaned and squatting on port 4000 for the next run (it can then
// answer a later readiness/test run with whatever env it started under,
// which is how a stale `REQUIRE_AUTH=true` process from an earlier `npm run
// dev` invocation ends up shadowing a fresh `start:pglite` run).
const server = spawn('npm', ['run', 'start:pglite', '-w', 'salve-db-server'], {
  stdio: 'inherit',
  shell: true,
  detached: true,
});
// A ChildProcess that fails to spawn (npm missing, EAGAIN, ...) emits 'error'
// asynchronously; with no listener that becomes an uncaught exception the
// surrounding try/catch below can never see, skipping cleanup entirely.
server.on('error', (error) => {
  console.error(`salve-db-server failed to start: ${error.message}`);
});

// Track the inner harness command so a programmatic `kill -TERM <this pid>`
// (not just an interactive Ctrl-C, which the child already receives directly
// via the shared foreground process group) also stops it, instead of leaving
// the harness runner and the simulator session it drives orphaned.
let child;

let stopped = false;
async function stopServer() {
  if (stopped || server.exitCode !== null || server.pid === undefined) return;
  stopped = true;

  child?.kill('SIGTERM');

  const exited = new Promise((resolve) => server.once('exit', resolve));
  try {
    process.kill(-server.pid, 'SIGTERM');
  } catch {
    return; // process group already gone
  }

  // `detached: true` means the parent exiting does not take the group down —
  // wait for the real exit (bounded) instead of racing process.exit() against
  // a SIGTERM that pglite/tsx may take a moment to act on.
  const timedOut = await Promise.race([
    exited.then(() => false),
    new Promise((resolve) => setTimeout(() => resolve(true), STOP_TIMEOUT_MS)),
  ]);
  if (timedOut) {
    try {
      process.kill(-server.pid, 'SIGKILL');
    } catch {
      // already gone
    }
  }
}

// Same readiness check the CI workflows use (`npx wait-on <url> -t <ms>` in
// .github/workflows/harness-{ios,android}.yml) — one implementation of "wait
// for salve-db-server to be ready", not two that can silently drift apart.
async function waitForServer(url, timeoutMs) {
  const exitCode = await new Promise((resolve, reject) => {
    const waiter = spawn('npx', ['--yes', 'wait-on', url, '-t', String(timeoutMs)], {
      stdio: 'inherit',
      shell: true,
    });
    waiter.on('error', reject);
    waiter.on('exit', (code) => resolve(code ?? 1));
  });
  if (exitCode !== 0) {
    throw new Error(`salve-db-server did not become ready at ${url} within ${timeoutMs}ms`);
  }
}

process.on('SIGINT', async () => {
  await stopServer();
  process.exit(130);
});
process.on('SIGTERM', async () => {
  await stopServer();
  process.exit(143);
});

try {
  await waitForServer(READY_URL, READY_TIMEOUT_MS);

  child = spawn(command, { stdio: 'inherit', shell: true });
  const exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });

  await stopServer();
  process.exit(exitCode);
} catch (error) {
  console.error(error.message);
  await stopServer();
  process.exit(1);
}
