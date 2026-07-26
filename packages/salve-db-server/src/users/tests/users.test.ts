import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Express } from 'express';
import { mountModule } from '../../testing/mountModule';
import { createTestExecutor } from '../../testing/testDb';
import { PostgresResourceStore } from '../../rest/store';
import { createUsersModule } from '../handler';
import type { IUser } from '../user';

/**
 * A fresh store + app per test, via `beforeEach` — every test starts from a
 * genuinely empty table, exactly like a real server before real traffic
 * arrives, and no test can leak state into another.
 */
let app: Express;

beforeEach(async () => {
  const executor = await createTestExecutor();
  app = mountModule(createUsersModule(new PostgresResourceStore<IUser>(executor, { table: 'users', columns: ['name', 'email'] })));
});

describe('POST /users', () => {
  it('creates a user and returns 201 with the full entity', async () => {
    const response = await request(app)
      .post('/users')
      .send({ name: 'Ana', email: 'ana@x.dev' })
      .expect(201);

    assert.match(response.headers['content-type']!, /json/);
    assert.equal(response.body.name, 'Ana');
    assert.equal(response.body.email, 'ana@x.dev');
    assert.equal(response.body.id, 1);
    assert.equal(response.body.deletedAt, null);
    assert.ok(Number.isInteger(response.body.updatedAt));
    assert.equal('localId' in response.body, false);
  });

  it('rejects a body missing a required field with 400', async () => {
    const response = await request(app).post('/users').send({ name: 'Ana' }).expect(400);
    assert.match(response.body.error, /email/);
  });

  it('rejects malformed JSON with 400', async () => {
    await request(app)
      .post('/users')
      .set('Content-Type', 'application/json')
      .send('{not valid json')
      .expect(400);
  });
});

describe('GET /users/:id', () => {
  it('returns the entity for a live id', async () => {
    const created = await request(app).post('/users').send({ name: 'Ana', email: 'ana@x.dev' });

    const response = await request(app).get(`/users/${created.body.id}`).expect(200);

    assert.equal(response.body.name, 'Ana');
  });

  it('returns 404 for a missing id', async () => {
    await request(app).get('/users/999').expect(404);
  });

  it('returns 404 for a malformed (non-numeric) id', async () => {
    await request(app).get('/users/abc').expect(404);
  });

  it('returns 404 for a deleted id — tombstones never appear on a single-resource GET', async () => {
    const created = await request(app).post('/users').send({ name: 'Ana', email: 'ana@x.dev' });
    await request(app).delete(`/users/${created.body.id}`).expect(204);

    await request(app).get(`/users/${created.body.id}`).expect(404);
  });
});

describe('PATCH /users/:id', () => {
  it('updates the entity and bumps updatedAt', async () => {
    const created = await request(app).post('/users').send({ name: 'Ana', email: 'ana@x.dev' });

    const response = await request(app)
      .patch(`/users/${created.body.id}`)
      .send({ name: 'Ana Silva' })
      .expect(200);

    assert.equal(response.body.name, 'Ana Silva');
    assert.equal(response.body.email, 'ana@x.dev'); // untouched field preserved
    assert.ok(response.body.updatedAt > created.body.updatedAt);
  });

  it('returns 404 for a missing id', async () => {
    await request(app).patch('/users/999').send({ name: 'X' }).expect(404);
  });

  it('returns 404 for an already-deleted id', async () => {
    const created = await request(app).post('/users').send({ name: 'Ana', email: 'ana@x.dev' });
    await request(app).delete(`/users/${created.body.id}`);

    await request(app).patch(`/users/${created.body.id}`).send({ name: 'X' }).expect(404);
  });

  it('rejects an empty patch with 400 — a no-op write must not pollute the pull stream', async () => {
    const created = await request(app).post('/users').send({ name: 'Ana', email: 'ana@x.dev' });

    await request(app).patch(`/users/${created.body.id}`).send({}).expect(400);
  });
});

describe('DELETE /users/:id', () => {
  it('deletes with 204 and no body', async () => {
    const created = await request(app).post('/users').send({ name: 'Ana', email: 'ana@x.dev' });

    const response = await request(app).delete(`/users/${created.body.id}`).expect(204);

    assert.equal(response.text, '');
  });

  it('returns 404 on a second delete — not idempotent-silent', async () => {
    const created = await request(app).post('/users').send({ name: 'Ana', email: 'ana@x.dev' });
    await request(app).delete(`/users/${created.body.id}`).expect(204);

    await request(app).delete(`/users/${created.body.id}`).expect(404);
  });

  it('returns 404 for a never-existed id', async () => {
    await request(app).delete('/users/999').expect(404);
  });
});

describe('GET /users (list + pagination + tombstones)', () => {
  it('is an empty array for a fresh table', async () => {
    const response = await request(app).get('/users').expect(200);
    assert.deepEqual(response.body, []);
  });

  it('paginates: a limited page returns exactly `limit`, ordered oldest first', async () => {
    await request(app).post('/users').send({ name: 'Ana', email: 'a@x.dev' });
    await request(app).post('/users').send({ name: 'Bruno', email: 'b@x.dev' });
    await request(app).post('/users').send({ name: 'Caio', email: 'c@x.dev' });

    const page = await request(app).get('/users?limit=2').expect(200);

    assert.deepEqual(
      page.body.map((u: IUser) => u.id),
      [1, 2]
    );
  });

  it('resuming with updatedAfter from the last row of a page yields exactly the remainder', async () => {
    await request(app).post('/users').send({ name: 'Ana', email: 'a@x.dev' });
    const b = await request(app).post('/users').send({ name: 'Bruno', email: 'b@x.dev' });
    await request(app).post('/users').send({ name: 'Caio', email: 'c@x.dev' });

    const resumed = await request(app).get(`/users?updatedAfter=${b.body.updatedAt}&limit=2`).expect(200);

    assert.deepEqual(
      resumed.body.map((u: IUser) => u.id),
      [3]
    );
  });

  it('a cursor equal to the last write means "fully caught up" — empty array', async () => {
    await request(app).post('/users').send({ name: 'Ana', email: 'a@x.dev' });
    const last = await request(app).post('/users').send({ name: 'Bruno', email: 'b@x.dev' });

    const response = await request(app).get(`/users?updatedAfter=${last.body.updatedAt}`).expect(200);

    assert.deepEqual(response.body, []);
  });

  it('a deleted row appears as a minimal { id, deletedAt } tombstone, mixed in with live rows', async () => {
    const a = await request(app).post('/users').send({ name: 'Ana', email: 'a@x.dev' });
    const cursorBeforeDelete = a.body.updatedAt;
    const b = await request(app).post('/users').send({ name: 'Bruno', email: 'b@x.dev' });
    await request(app).delete(`/users/${b.body.id}`).expect(204);

    const response = await request(app).get(`/users?updatedAfter=${cursorBeforeDelete}`).expect(200);

    assert.equal(response.body.length, 1);
    assert.deepEqual(Object.keys(response.body[0]).sort(), ['deletedAt', 'id']);
    assert.equal(response.body[0].id, b.body.id);
  });

  it('a tombstone does not appear before its own cursor', async () => {
    const a = await request(app).post('/users').send({ name: 'Ana', email: 'a@x.dev' });
    await request(app).delete(`/users/${a.body.id}`).expect(204);

    const listAtDelete = await request(app).get('/users?updatedAfter=0').expect(200);
    const deletedAt = listAtDelete.body[0].deletedAt;

    const response = await request(app).get(`/users?updatedAfter=${deletedAt}`).expect(200);
    assert.deepEqual(response.body, []);
  });

  it('rejects a non-integer limit with 400', async () => {
    await request(app).get('/users?limit=abc').expect(400);
  });

  it('rejects a negative updatedAfter with 400', async () => {
    await request(app).get('/users?updatedAfter=-1').expect(400);
  });
});

describe('unknown routes', () => {
  it('returns 404', async () => {
    await request(app).get('/nope').expect(404);
  });
});
