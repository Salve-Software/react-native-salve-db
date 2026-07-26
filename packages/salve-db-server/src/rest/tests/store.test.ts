import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { PostgresResourceStore } from '../store';
import type { IResourceBase } from '../types';

interface IWidget extends IResourceBase {
  label: string;
}

// A synthetic entity/table, isolated from docker/init.sql's real schema — this
// file tests PostgresResourceStore's genericity, not any specific real entity.
async function freshStore(): Promise<PostgresResourceStore<IWidget>> {
  const db = new PGlite();
  await db.exec(
    'CREATE TABLE widgets (id SERIAL PRIMARY KEY, label TEXT NOT NULL, "updatedAt" BIGINT NOT NULL, "deletedAt" BIGINT)'
  );
  await db.exec(
    'CREATE TABLE _tick_state (id INTEGER PRIMARY KEY DEFAULT 1, last_tick BIGINT NOT NULL DEFAULT 0, CHECK (id = 1)); INSERT INTO _tick_state (id, last_tick) VALUES (1, 0);'
  );
  return new PostgresResourceStore<IWidget>(db, { table: 'widgets', columns: ['label'] });
}

describe('PostgresResourceStore', () => {
  describe('create', () => {
    it('assigns an incrementing id and stamps updatedAt/deletedAt', async () => {
      const store = await freshStore();

      const a = await store.create({ label: 'a' });
      const b = await store.create({ label: 'b' });

      assert.equal(a.id, 1);
      assert.equal(b.id, 2);
      assert.equal(a.deletedAt, null);
      assert.ok(Number.isInteger(a.updatedAt));
    });

    // updatedAt is now allocated inside Postgres under an advisory lock, not a JS clock, so overlapping calls can't produce out-of-order or colliding values.
    it('concurrent creates never collide or reorder relative to id assignment', async () => {
      const store = await freshStore();

      const [a, b, c] = await Promise.all([
        store.create({ label: 'a' }),
        store.create({ label: 'b' }),
        store.create({ label: 'c' }),
      ]);

      const updatedAts = [a.updatedAt, b.updatedAt, c.updatedAt];
      assert.deepEqual([...updatedAts].sort((x, y) => x - y), updatedAts);
      assert.equal(new Set(updatedAts).size, 3);
    });
  });

  describe('get', () => {
    it('returns the live row', async () => {
      const store = await freshStore();
      const created = await store.create({ label: 'a' });

      assert.deepEqual(await store.get(created.id), created);
    });

    it('returns null for a missing id', async () => {
      const store = await freshStore();
      assert.equal(await store.get(999), null);
    });

    it('returns null for a tombstoned id', async () => {
      const store = await freshStore();
      const created = await store.create({ label: 'a' });
      await store.remove(created.id);

      assert.equal(await store.get(created.id), null);
    });
  });

  describe('update', () => {
    it('merges the patch and bumps updatedAt', async () => {
      const store = await freshStore();
      const created = await store.create({ label: 'a' });

      const updated = await store.update(created.id, { label: 'b' });

      assert.ok(updated);
      assert.equal(updated?.label, 'b');
      assert.equal(updated?.id, created.id);
      assert.ok((updated?.updatedAt ?? 0) > created.updatedAt);
    });

    it('returns null for a missing id', async () => {
      const store = await freshStore();
      assert.equal(await store.update(999, { label: 'x' }), null);
    });

    it('returns null for a tombstoned id', async () => {
      const store = await freshStore();
      const created = await store.create({ label: 'a' });
      await store.remove(created.id);

      assert.equal(await store.update(created.id, { label: 'x' }), null);
    });
  });

  describe('remove', () => {
    it('returns true the first time and false on a second delete of the same id', async () => {
      const store = await freshStore();
      const created = await store.create({ label: 'a' });

      assert.equal(await store.remove(created.id), true);
      assert.equal(await store.remove(created.id), false);
    });

    it('returns false for a missing id', async () => {
      const store = await freshStore();
      assert.equal(await store.remove(999), false);
    });

    it('collapses the row to exactly { id, deletedAt } in list() — no leaked fields', async () => {
      const store = await freshStore();
      const created = await store.create({ label: 'a' });
      await store.remove(created.id);

      const [tombstone] = await store.list({ since: 0, limit: 10 });

      assert.deepEqual(Object.keys(tombstone!).sort(), ['deletedAt', 'id']);
      assert.equal(tombstone!.id, created.id);
    });
  });

  describe('list', () => {
    it('is empty for a fresh store', async () => {
      const store = await freshStore();
      assert.deepEqual(await store.list({ since: 0, limit: 10 }), []);
    });

    it('orders by (updatedAt, id) ascending', async () => {
      const store = await freshStore();
      const a = await store.create({ label: 'a' });
      const b = await store.create({ label: 'b' });
      const c = await store.create({ label: 'c' });

      const rows = await store.list({ since: 0, limit: 10 });

      assert.deepEqual(rows.map((r) => r.id), [a.id, b.id, c.id]);
    });

    it('applies an exclusive cursor — since equal to the last row is fully caught up', async () => {
      const store = await freshStore();
      await store.create({ label: 'a' });
      const b = await store.create({ label: 'b' });

      assert.deepEqual(await store.list({ since: b.updatedAt, limit: 10 }), []);
    });

    it('caps results at limit, in cursor order', async () => {
      const store = await freshStore();
      const a = await store.create({ label: 'a' });
      const b = await store.create({ label: 'b' });
      await store.create({ label: 'c' });

      const rows = await store.list({ since: 0, limit: 2 });

      assert.deepEqual(rows.map((r) => r.id), [a.id, b.id]);
    });

    it('resuming from the last id of a page yields exactly the remainder', async () => {
      const store = await freshStore();
      await store.create({ label: 'a' });
      const b = await store.create({ label: 'b' });
      const c = await store.create({ label: 'c' });

      const resumed = await store.list({ since: b.updatedAt, limit: 10 });

      assert.deepEqual(resumed.map((r) => r.id), [c.id]);
    });

    it('mixes live rows and tombstones in the same cursor order', async () => {
      const store = await freshStore();
      const a = await store.create({ label: 'a' });
      const b = await store.create({ label: 'b' });
      await store.remove(a.id);

      const rows = await store.list({ since: 0, limit: 10 });

      // a's cursor key became its deletedAt (later than its original
      // updatedAt), so it now sorts after b, not before it.
      assert.deepEqual(rows.map((r) => r.id), [b.id, a.id]);
      assert.ok('deletedAt' in rows[1]! && !('label' in rows[1]!));
    });
  });
});
