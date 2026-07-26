import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://salve:salve@localhost:5432/salve_db_server',
});
