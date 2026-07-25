import type { NextFunction, Request, Response } from 'express';

/** Terminal handler for any route no module claimed. */
export function notFoundHandler(_req: Request, res: Response): void {
  res.status(404).json({ error: 'Not Found' });
}

/**
 * `express.json()` raises an error with `.type === 'entity.parse.failed'`
 * for a malformed body; everything else reaching here is unexpected.
 * Extracted so tests exercise the real middleware, not a re-implementation.
 */
export function jsonErrorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction): void {
  if (error !== null && typeof error === 'object' && (error as { type?: string }).type === 'entity.parse.failed') {
    res.status(400).json({ error: 'Invalid JSON body' });
    return;
  }
  res.status(500).json({ error: 'Internal Server Error' });
}
