import express, { type Express } from 'express';
import type { IResourceModule } from './rest/types';
import { notFoundHandler, jsonErrorHandler } from './rest/middleware';
import { usersModule } from './users/handler';
import { productsModule } from './products/handler';

/** Every domain module the production server exposes. Adding an entity = one entry here. */
const defaultModules: IResourceModule[] = [usersModule, productsModule];

/**
 * Assembles the Express app. Defaults to the real, shared-store modules;
 * tests pass their own isolated modules (see `src/testing/mountModule.ts`)
 * instead of relying on this default.
 */
export function createServer(modules: IResourceModule[] = defaultModules): Express {
  const app = express();
  app.use(express.json());

  for (const resourceModule of modules) {
    app.use(resourceModule.basePath, resourceModule.router);
  }

  app.use(notFoundHandler);
  app.use(jsonErrorHandler);

  return app;
}
