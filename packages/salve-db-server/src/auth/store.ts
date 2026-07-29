import { randomUUID } from 'node:crypto';

/**
 * The one account this server ever authenticates — good enough to exercise
 * the sync engine's oauth2 credential flow end-to-end, not a real user store.
 */
const MOCK_USER = {
  email: 'demo@salve.dev',
  password: 'salve-demo-2026',
};

/** Read on every issuance, not cached at module load, so tests can override it per-run. */
function accessTokenTtlMs(): number {
  return Number(process.env.ACCESS_TOKEN_TTL_MS ?? 20_000);
}

interface AccessTokenRecord {
  email: string;
  expiresAt: number;
}

const accessTokens = new Map<string, AccessTokenRecord>();
// refreshToken -> email. Rotated on every refresh so a used refresh token
// can't be replayed, which also exercises the native engine re-persisting
// both tokens, not just the access token.
const refreshTokens = new Map<string, string>();

let refreshCount = 0;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

function issueTokenPair(email: string): TokenPair {
  const accessToken = randomUUID();
  const refreshToken = randomUUID();
  const expiresIn = accessTokenTtlMs();
  accessTokens.set(accessToken, { email, expiresAt: Date.now() + expiresIn });
  refreshTokens.set(refreshToken, email);
  return { accessToken, refreshToken, expiresIn };
}

/** `null` on a wrong email/password. */
export function login(email: string, password: string): TokenPair | null {
  if (email !== MOCK_USER.email || password !== MOCK_USER.password) return null;
  return issueTokenPair(email);
}

/** `null` when the refresh token is unknown (never issued, or already rotated away). */
export function refreshTokenPair(refreshToken: string): TokenPair | null {
  const email = refreshTokens.get(refreshToken);
  if (email === undefined) return null;

  refreshTokens.delete(refreshToken);
  refreshCount += 1;
  return issueTokenPair(email);
}

export function isValidAccessToken(accessToken: string): boolean {
  const record = accessTokens.get(accessToken);
  return record !== undefined && record.expiresAt > Date.now();
}

/** Number of successful refreshes so far — surfaced for manual QA of the native refresh flow. */
export function getRefreshCount(): number {
  return refreshCount;
}
