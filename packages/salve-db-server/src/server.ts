import express, { type Express } from 'express';
import type { IResourceModule } from './rest/types';
import { notFoundHandler, jsonErrorHandler, requestLogger } from './rest/middleware';
import { usersModule } from './users/handler';
import { productsModule } from './products/handler';
import { authModule } from './auth/handler';
import { requireAuth } from './auth/middleware';

/** Every domain module the production server exposes. Adding an entity = one entry here. */
const defaultModules: IResourceModule[] = [usersModule, productsModule];

export interface CreateServerOptions {
  /**
   * Protect `modules`' routes behind `requireAuth`. `/auth/login` and
   * `/auth/refresh` are always open regardless — the native CredentialProvider
   * calls refresh with no Authorization header. Defaults to `false` so the
   * existing test suites (none of which log in) keep passing unchanged.
   */
  requireAuth?: boolean;
}

/**
 * Assembles the Express app. Defaults to the real, shared-store modules;
 * tests pass their own isolated modules (see `src/testing/mountModule.ts`)
 * instead of relying on this default.
 */
export function createServer(modules: IResourceModule[] = defaultModules, options: CreateServerOptions = {}): Express {
  const app = express();
  app.use(requestLogger);
  app.use(express.json());

  app.use(authModule.basePath, authModule.router);

  for (const resourceModule of modules) {
    if (options.requireAuth) {
      app.use(resourceModule.basePath, requireAuth, resourceModule.router);
    } else {
      app.use(resourceModule.basePath, resourceModule.router);
    }
  }

  app.use(notFoundHandler);
  app.use(jsonErrorHandler);

  return app;
}
