import type { NextFunction, Request, Response } from 'express';
import { logger } from './logger';

/** One line per completed request: method, path, query, status, duration. */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startedAt = Date.now();
  res.on('finish', () => {
    logger.info('http.request', {
      method: req.method,
      path: req.path,
      query: req.query,
      status: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });
  next();
}

/** Terminal handler for any route no module claimed. */
export function notFoundHandler(req: Request, res: Response): void {
  logger.warn('http.unmatched_route', { method: req.method, path: req.path });
  res.status(404).json({ error: 'Not Found' });
}

/**
 * `express.json()` raises an error with `.type === 'entity.parse.failed'`
 * for a malformed body; everything else reaching here is unexpected.
 * Extracted so tests exercise the real middleware, not a re-implementation.
 */
export function jsonErrorHandler(error: unknown, req: Request, res: Response, _next: NextFunction): void {
  if (error !== null && typeof error === 'object' && (error as { type?: string }).type === 'entity.parse.failed') {
    logger.warn('http.invalid_json_body', { method: req.method, path: req.path });
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  logger.error('http.internal_error', {
    method: req.method,
    path: req.path,
    error: error instanceof Error ? error.message : String(error),
  });
  res.status(500).json({ error: 'Internal Server Error' });
}
