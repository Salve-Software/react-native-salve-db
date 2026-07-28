process.env.ACCESS_TOKEN_TTL_MS = '10';

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import express, { type Express } from 'express';
import { authModule } from '../handler';
import { requireAuth } from '../middleware';

/**
 * A tiny app: the real `/auth` module plus one dummy protected route behind
 * `requireAuth`. CRUD-behind-auth is covered by `createServer`'s own tests —
 * this only needs to prove login/refresh/middleware behavior in isolation,
 * so it skips the Postgres-backed resource modules entirely.
 */
function buildApp(): Express {
  const app = express();
  app.use(express.json());
  app.use(authModule.basePath, authModule.router);
  app.get('/protected', requireAuth, (_req, res) => res.status(200).json({ ok: true }));
  return app;
}

const app = buildApp();

describe('POST /auth/login', () => {
  it('returns a token pair for the mock user', async () => {
    const response = await request(app)
      .post('/auth/login')
      .send({ email: 'demo@salve.dev', password: 'salve-demo-2026' })
      .expect(200);

    assert.equal(typeof response.body.accessToken, 'string');
    assert.equal(typeof response.body.refreshToken, 'string');
    assert.equal(typeof response.body.expiresIn, 'number');
  });

  it('rejects the wrong password with 401', async () => {
    await request(app)
      .post('/auth/login')
      .send({ email: 'demo@salve.dev', password: 'wrong' })
      .expect(401);
  });

  it('rejects a malformed body with 400', async () => {
    await request(app).post('/auth/login').send({ email: 'demo@salve.dev' }).expect(400);
  });
});

describe('POST /auth/refresh', () => {
  it('rotates the pair: old refresh token becomes unusable, new one works', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'demo@salve.dev', password: 'salve-demo-2026' })
      .expect(200);

    const first = await request(app)
      .post('/auth/refresh')
      .send({ refreshToken: login.body.refreshToken })
      .expect(200);

    assert.equal(typeof first.body.accessToken, 'string');
    assert.equal(typeof first.body.refreshToken, 'string');
    assert.notEqual(first.body.refreshToken, login.body.refreshToken);

    // replaying the now-rotated-away refresh token must fail
    await request(app).post('/auth/refresh').send({ refreshToken: login.body.refreshToken }).expect(401);

    // the freshly-issued one still works
    await request(app).post('/auth/refresh').send({ refreshToken: first.body.refreshToken }).expect(200);
  });

  it('rejects an unknown refresh token with 401', async () => {
    await request(app).post('/auth/refresh').send({ refreshToken: 'not-a-real-token' }).expect(401);
  });

  it('rejects a missing refreshToken with 400', async () => {
    await request(app).post('/auth/refresh').send({}).expect(400);
  });
});

describe('requireAuth middleware', () => {
  it('rejects a request with no Authorization header', async () => {
    await request(app).get('/protected').expect(401);
  });

  it('accepts the raw access token (no Bearer prefix), matching the native CredentialProvider', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'demo@salve.dev', password: 'salve-demo-2026' })
      .expect(200);

    await request(app)
      .get('/protected')
      .set('Authorization', login.body.accessToken)
      .expect(200);
  });

  it('also accepts a Bearer-prefixed token', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'demo@salve.dev', password: 'salve-demo-2026' })
      .expect(200);

    await request(app)
      .get('/protected')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .expect(200);
  });

  it('rejects an expired access token with 401', async () => {
    const login = await request(app)
      .post('/auth/login')
      .send({ email: 'demo@salve.dev', password: 'salve-demo-2026' })
      .expect(200);

    await new Promise((resolve) => setTimeout(resolve, 30)); // ACCESS_TOKEN_TTL_MS=10 above

    await request(app)
      .get('/protected')
      .set('Authorization', login.body.accessToken)
      .expect(401);
  });
});
