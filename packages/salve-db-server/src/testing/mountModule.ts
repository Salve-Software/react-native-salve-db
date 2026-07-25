import express, { type Express } from 'express';
import type { IResourceModule } from '../rest/types';
import { notFoundHandler, jsonErrorHandler, requestLogger } from '../rest/middleware';

/**
 * Mounts a single module (built against a fresh, test-owned store) behind
 * the same JSON parser + error/logging middleware the real server uses, so
 * integration tests exercise production wiring, not a re-implementation of
 * it. Each call returns an independent `Express` app — tests never share
 * state with each other this way.
 */
export function mountModule(module: IResourceModule): Express {
  const app = express();
  app.use(requestLogger);
  app.use(express.json());
  app.use(module.basePath, module.router);
  app.use(notFoundHandler);
  app.use(jsonErrorHandler);
  return app;
}
