CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  "updatedAt" BIGINT NOT NULL,
  "deletedAt" BIGINT
);
CREATE INDEX IF NOT EXISTS idx_users_cursor ON users (COALESCE("deletedAt", "updatedAt"), id);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  price DOUBLE PRECISION NOT NULL,
  "updatedAt" BIGINT NOT NULL,
  "deletedAt" BIGINT
);
CREATE INDEX IF NOT EXISTS idx_products_cursor ON products (COALESCE("deletedAt", "updatedAt"), id);

-- Single-row monotonic write clock, allocated atomically under an advisory lock — see PostgresResourceStore.
CREATE TABLE IF NOT EXISTS _tick_state (id INTEGER PRIMARY KEY DEFAULT 1, last_tick BIGINT NOT NULL DEFAULT 0, CHECK (id = 1));
INSERT INTO _tick_state (id, last_tick) VALUES (1, 0) ON CONFLICT (id) DO NOTHING;
