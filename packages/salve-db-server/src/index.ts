import { createServer } from './server';

const port = Number(process.env.PORT ?? 4000);

createServer().listen(port, () => {
  console.log(`salve-db-server listening on http://localhost:${port}`);
});

