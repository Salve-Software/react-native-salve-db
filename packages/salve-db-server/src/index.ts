import { createServer } from './server';

const port = Number(process.env.PORT ?? 4000);
const requireAuth = process.env.REQUIRE_AUTH === 'true';

createServer(undefined, { requireAuth }).listen(port, () => {
  console.log(`salve-db-server listening on http://localhost:${port}${requireAuth ? ' (auth required)' : ''}`);
});

