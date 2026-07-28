import type { NextFunction, Request, Response } from 'express';
import { isValidAccessToken } from './store';
import { logger } from '../rest/logger';

/**
 * The native `CredentialProvider` sends the access token raw, with no
 * `Bearer ` prefix — but accepting the prefix too costs nothing and matches
 * how most real backends read `Authorization`.
 */
function extractAccessToken(header: string | undefined): string | null {
  if (header === undefined) return null;
  return header.startsWith('Bearer ') ? header.slice('Bearer '.length) : header;
}

/** Protects resource routes; `/auth/login` and `/auth/refresh` must never sit behind this. */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractAccessToken(req.headers.authorization);
  if (token === null || !isValidAccessToken(token)) {
    logger.warn('auth.unauthorized', { method: req.method, path: req.path });
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}
