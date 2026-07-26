import { Pool } from 'pg';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { QueryExecutor } from './rest/store';

// @electric-sql/pglite is a devDependency — required dynamically so a
// production install (DB_DRIVER unset) never needs it on disk. PGlite is
// usable immediately after construction (queues internally until the WASM
// VM is ready), so `exec` doesn't need to be awaited here.
function createPGliteExecutor(): QueryExecutor {
  const { PGlite } = require('@electric-sql/pglite') as typeof import('@electric-sql/pglite');
  const db = new PGlite();
  void db.exec(readFileSync(join(__dirname, '../docker/init.sql'), 'utf-8'));
  return db;
}

function createExecutor(): QueryExecutor {
  if (process.env.DB_DRIVER === 'pglite') return createPGliteExecutor();
  return new Pool({ connectionString: process.env.DATABASE_URL ?? 'postgres://salve:salve@localhost:5432/salve_db_server' });
}

export const pool = createExecutor();
