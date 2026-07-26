#!/usr/bin/env node
import { spawn } from 'node:child_process';

const command = process.argv.slice(2).join(' ');
if (!command) {
  console.error('Usage: node scripts/with-harness-server.mjs "<command to run>"');
  process.exit(1);
}

const READY_URL = 'http://localhost:4000/users';
const READY_TIMEOUT_MS = 30000;

const server = spawn('npm', ['run', 'start:pglite', '-w', 'salve-db-server'], {
  stdio: 'inherit',
  shell: true,
});

function stopServer() {
  if (server.exitCode === null) server.kill();
}

async function waitForServer(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // not up yet — keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  throw new Error(`salve-db-server did not become ready at ${url} within ${timeoutMs}ms`);
}

try {
  await waitForServer(READY_URL, READY_TIMEOUT_MS);

  const child = spawn(command, { stdio: 'inherit', shell: true });
  const exitCode = await new Promise((resolve) => child.on('exit', (code) => resolve(code ?? 1)));

  stopServer();
  process.exit(exitCode);
} catch (error) {
  console.error(error.message);
  stopServer();
  process.exit(1);
}
