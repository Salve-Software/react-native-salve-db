#!/usr/bin/env node
import { exec } from 'node:child_process';
import { StudioServer } from './server';

const port = Number(process.env.PORT ?? 7377);

new StudioServer().listen(port, () => {
  const url = `http://localhost:${port}`;
  console.log(`salve-db-studio listening on ${url}`);
  console.log('Waiting for a dev build of the app to connect (the Studio agent starts automatically when __DEV__ is true)...');
  openBrowser(url);
});

function openBrowser(url: string): void {
  const command = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  exec(`${command} ${url}`, (err) => {
    if (err) console.log(`Open ${url} manually — could not launch a browser automatically.`);
  });
}
