import { Router } from 'express';
import type { IResourceModule } from '../rest/types';
import { asObject, requireString } from '../rest/validation';
import { logger } from '../rest/logger';
import { getRefreshCount, login, refreshTokenPair } from './store';

const router = Router();

router.post('/login', (req, res) => {
  const source = asObject(req.body);
  if (source === null) {
    res.status(400).json({ error: 'Body must be a JSON object' });
    return;
  }

  const email = requireString(source, 'email');
  if (!email.ok) {
    res.status(400).json({ error: email.error });
    return;
  }

  const password = requireString(source, 'password');
  if (!password.ok) {
    res.status(400).json({ error: password.error });
    return;
  }

  const tokens = login(email.value, password.value);
  if (tokens === null) {
    logger.warn('auth.login_failed', { email: email.value });
    res.status(401).json({ error: 'Invalid email or password' });
    return;
  }

  logger.info('auth.login_ok', { email: email.value });
  res.status(200).json(tokens);
});

// Fixed contract: CredentialProvider.cpp posts exactly `{"refreshToken": "..."}`,
// with no Authorization header, and requires the 2xx response to carry both
// accessToken and refreshToken.
router.post('/refresh', (req, res) => {
  const source = asObject(req.body);
  const refreshToken = source?.refreshToken;
  if (typeof refreshToken !== 'string' || refreshToken.trim() === '') {
    res.status(400).json({ error: 'refreshToken must be a non-empty string' });
    return;
  }

  const tokens = refreshTokenPair(refreshToken);
  if (tokens === null) {
    logger.warn('auth.refresh_failed');
    res.status(401).json({ error: 'Unknown or expired refresh token' });
    return;
  }

  logger.info('auth.refresh_ok');
  res.status(200).json(tokens);
});

// Manual-QA aid only: lets the example app's UI show that a native refresh
// actually happened, since the JS side never observes it directly.
router.get('/_debug/refreshCount', (_req, res) => {
  res.status(200).json({ refreshCount: getRefreshCount() });
});

export const authModule: IResourceModule = { basePath: '/auth', router };
