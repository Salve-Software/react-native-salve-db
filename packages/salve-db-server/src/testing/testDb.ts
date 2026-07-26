import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import type { QueryExecutor } from '../rest/store';

const initSql = readFileSync(join(__dirname, '../../docker/init.sql'), 'utf-8');

/**
 * A fresh, isolated Postgres instance per call (real SQL, real schema, via
 * PGlite's in-process WASM build) — same "isolated store per test" pattern
 * `ResourceStore` used to provide, now against the schema `docker/init.sql`
 * also feeds the real Postgres container.
 */
export async function createTestExecutor(): Promise<QueryExecutor> {
  const db = new PGlite();
  await db.exec(initSql);
  return db;
}
