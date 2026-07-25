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
