import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import type { Express } from 'express';
import { mountModule } from '../../testing/mountModule';
import { ResourceStore } from '../../rest/store';
import { createProductsModule } from '../handler';
import type { IProduct } from '../product';

let app: Express;

beforeEach(() => {
  app = mountModule(createProductsModule(new ResourceStore<IProduct>()));
});

describe('POST /products', () => {
  it('creates a product and returns 201 with the full entity', async () => {
    const response = await request(app).post('/products').send({ name: 'Mouse', price: 99.9 }).expect(201);

    assert.equal(response.body.name, 'Mouse');
    assert.equal(response.body.price, 99.9);
    assert.equal(response.body.deletedAt, null);
  });

  it('rejects a non-numeric price with 400', async () => {
    const response = await request(app).post('/products').send({ name: 'Mouse', price: 'free' }).expect(400);
    assert.match(response.body.error, /price/);
  });

  it('rejects a negative price with 400', async () => {
    await request(app).post('/products').send({ name: 'Mouse', price: -1 }).expect(400);
  });

  it('accepts a zero price', async () => {
    await request(app).post('/products').send({ name: 'Free sample', price: 0 }).expect(201);
  });
});

describe('PATCH /products/:id', () => {
  it('updates price independently of name', async () => {
    const created = await request(app).post('/products').send({ name: 'Mouse', price: 99.9 });

    const response = await request(app).patch(`/products/${created.body.id}`).send({ price: 79.9 }).expect(200);

    assert.equal(response.body.price, 79.9);
    assert.equal(response.body.name, 'Mouse');
  });
});

describe('DELETE /products/:id', () => {
  it('tombstones on delete, 404 after', async () => {
    const created = await request(app).post('/products').send({ name: 'Mouse', price: 99.9 });

    await request(app).delete(`/products/${created.body.id}`).expect(204);
    await request(app).get(`/products/${created.body.id}`).expect(404);
  });
});

describe("GET /products — this module's own param names", () => {
  it('honours page_size for pagination', async () => {
    await request(app).post('/products').send({ name: 'Mouse', price: 10 });
    await request(app).post('/products').send({ name: 'Teclado', price: 20 });
    await request(app).post('/products').send({ name: 'Monitor', price: 30 });

    const page = await request(app).get('/products?page_size=2').expect(200);

    assert.equal(page.body.length, 2);
  });

  it('honours modified_since for the incremental cursor', async () => {
    const first = await request(app).post('/products').send({ name: 'Mouse', price: 10 });
    await request(app).post('/products').send({ name: 'Teclado', price: 20 });

    const response = await request(app).get(`/products?modified_since=${first.body.updatedAt}`).expect(200);

    assert.equal(response.body.length, 1);
    assert.equal(response.body[0].name, 'Teclado');
  });

  it("ignores users' param names (limit, updatedAfter) — own config is independent", async () => {
    await request(app).post('/products').send({ name: 'Mouse', price: 10 });
    await request(app).post('/products').send({ name: 'Teclado', price: 20 });

    // `limit` isn't this module's page-size param, so it's inert; both rows come back.
    const response = await request(app).get('/products?limit=1').expect(200);

    assert.equal(response.body.length, 2);
  });
});
