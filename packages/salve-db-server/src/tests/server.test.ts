import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '../server';
import { createUsersModule } from '../users/handler';
import { createProductsModule } from '../products/handler';
import { createTestExecutor } from '../testing/testDb';
import { PostgresResourceStore } from '../rest/store';
import type { IUser } from '../users/user';
import type { IProduct } from '../products/product';

/**
 * Builds the real, assembled app (`createServer`'s actual production code
 * path), but wired to a fresh, isolated PGlite instance per test instead of
 * the singleton `userStore`/`productStore` — this is what `createServer`'s
 * optional `modules` param exists for. Both modules share the one instance,
 * same as they'd share one real Postgres pool in production.
 */
let app: Express;

beforeEach(async () => {
  const executor = await createTestExecutor();
  app = createServer([
    createUsersModule(new PostgresResourceStore<IUser>(executor, { table: 'users', columns: ['name', 'email'] })),
    createProductsModule(new PostgresResourceStore<IProduct>(executor, { table: 'products', columns: ['name', 'price'] })),
  ]);
});

describe('createServer — module composition', () => {
  it('mounts both modules at their own base paths', async () => {
    await request(app).post('/users').send({ name: 'Ana', email: 'ana@x.dev' }).expect(201);
    await request(app).post('/products').send({ name: 'Mouse', price: 10 }).expect(201);
  });

  it("a query param name from one module is inert on the other module's route", async () => {
    await request(app).post('/users').send({ name: 'Ana', email: 'a@x.dev' });
    await request(app).post('/users').send({ name: 'Bruno', email: 'b@x.dev' });
    await request(app).post('/products').send({ name: 'Mouse', price: 10 });
    await request(app).post('/products').send({ name: 'Teclado', price: 20 });

    // users' own param (limit) actually cuts the page...
    const usersLimited = await request(app).get('/users?limit=1').expect(200);
    assert.equal(usersLimited.body.length, 1);
    // ...but products' page-size param name is different, so `limit` does nothing there.
    const productsUnaffected = await request(app).get('/products?limit=1').expect(200);
    assert.equal(productsUnaffected.body.length, 2);

    // and the reverse: products' own param (page_size) cuts its page...
    const productsLimited = await request(app).get('/products?page_size=1').expect(200);
    assert.equal(productsLimited.body.length, 1);
    // ...but is inert on users.
    const usersUnaffected = await request(app).get('/users?page_size=1').expect(200);
    assert.equal(usersUnaffected.body.length, 2);
  });

  it('an unmatched route falls through to the shared 404 handler', async () => {
    const response = await request(app).get('/widgets').expect(404);
    assert.deepEqual(response.body, { error: 'Not Found' });
  });

  it('a malformed JSON body on either module hits the shared error handler', async () => {
    await request(app)
      .post('/users')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400);

    await request(app)
      .post('/products')
      .set('Content-Type', 'application/json')
      .send('{bad')
      .expect(400);
  });
});
