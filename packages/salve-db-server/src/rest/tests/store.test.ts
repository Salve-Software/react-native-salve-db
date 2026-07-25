import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { ResourceStore } from '../store';
import type { IResourceBase } from '../types';

interface IWidget extends IResourceBase {
  label: string;
}

describe('ResourceStore', () => {
  describe('create', () => {
    it('assigns an incrementing id and stamps updatedAt/deletedAt', () => {
      const store = new ResourceStore<IWidget>();

      const a = store.create({ label: 'a' });
      const b = store.create({ label: 'b' });

      assert.equal(a.id, 1);
      assert.equal(b.id, 2);
      assert.equal(a.deletedAt, null);
      assert.ok(Number.isInteger(a.updatedAt));
    });
  });

  describe('get', () => {
    it('returns the live row', () => {
      const store = new ResourceStore<IWidget>();
      const created = store.create({ label: 'a' });

      assert.deepEqual(store.get(created.id), created);
    });

    it('returns null for a missing id', () => {
      const store = new ResourceStore<IWidget>();
      assert.equal(store.get(999), null);
    });

    it('returns null for a tombstoned id', () => {
      const store = new ResourceStore<IWidget>();
      const created = store.create({ label: 'a' });
      store.remove(created.id);

      assert.equal(store.get(created.id), null);
    });
  });

  describe('update', () => {
    it('merges the patch and bumps updatedAt', () => {
      const store = new ResourceStore<IWidget>();
      const created = store.create({ label: 'a' });

      const updated = store.update(created.id, { label: 'b' });

      assert.ok(updated);
      assert.equal(updated?.label, 'b');
      assert.equal(updated?.id, created.id);
      assert.ok((updated?.updatedAt ?? 0) > created.updatedAt);
    });

    it('returns null for a missing id', () => {
      const store = new ResourceStore<IWidget>();
      assert.equal(store.update(999, { label: 'x' }), null);
    });

    it('returns null for a tombstoned id', () => {
      const store = new ResourceStore<IWidget>();
      const created = store.create({ label: 'a' });
      store.remove(created.id);

      assert.equal(store.update(created.id, { label: 'x' }), null);
    });
  });

  describe('remove', () => {
    it('returns true the first time and false on a second delete of the same id', () => {
      const store = new ResourceStore<IWidget>();
      const created = store.create({ label: 'a' });

      assert.equal(store.remove(created.id), true);
      assert.equal(store.remove(created.id), false);
    });

    it('returns false for a missing id', () => {
      const store = new ResourceStore<IWidget>();
      assert.equal(store.remove(999), false);
    });

    it('collapses the row to exactly { id, deletedAt } in list() — no leaked fields', () => {
      const store = new ResourceStore<IWidget>();
      const created = store.create({ label: 'a' });
      store.remove(created.id);

      const [tombstone] = store.list({ since: 0, limit: 10 });

      assert.deepEqual(Object.keys(tombstone!).sort(), ['deletedAt', 'id']);
      assert.equal(tombstone!.id, created.id);
    });
  });

  describe('list', () => {
    it('is empty for a fresh store', () => {
      const store = new ResourceStore<IWidget>();
      assert.deepEqual(store.list({ since: 0, limit: 10 }), []);
    });

    it('orders by (updatedAt, id) ascending', () => {
      const store = new ResourceStore<IWidget>();
      const a = store.create({ label: 'a' });
      const b = store.create({ label: 'b' });
      const c = store.create({ label: 'c' });

      const rows = store.list({ since: 0, limit: 10 });

      assert.deepEqual(rows.map((r) => r.id), [a.id, b.id, c.id]);
    });

    it('applies an exclusive cursor — since equal to the last row is fully caught up', () => {
      const store = new ResourceStore<IWidget>();
      store.create({ label: 'a' });
      const b = store.create({ label: 'b' });

      assert.deepEqual(store.list({ since: b.updatedAt, limit: 10 }), []);
    });

    it('caps results at limit, in cursor order', () => {
      const store = new ResourceStore<IWidget>();
      const a = store.create({ label: 'a' });
      const b = store.create({ label: 'b' });
      store.create({ label: 'c' });

      const rows = store.list({ since: 0, limit: 2 });

      assert.deepEqual(rows.map((r) => r.id), [a.id, b.id]);
    });

    it('resuming from the last id of a page yields exactly the remainder', () => {
      const store = new ResourceStore<IWidget>();
      store.create({ label: 'a' });
      const b = store.create({ label: 'b' });
      const c = store.create({ label: 'c' });

      const resumed = store.list({ since: b.updatedAt, limit: 10 });

      assert.deepEqual(resumed.map((r) => r.id), [c.id]);
    });

    it('mixes live rows and tombstones in the same cursor order', () => {
      const store = new ResourceStore<IWidget>();
      const a = store.create({ label: 'a' });
      const b = store.create({ label: 'b' });
      store.remove(a.id);

      const rows = store.list({ since: 0, limit: 10 });

      // a's cursor key became its deletedAt (later than its original
      // updatedAt), so it now sorts after b, not before it.
      assert.deepEqual(rows.map((r) => r.id), [b.id, a.id]);
      assert.ok('deletedAt' in rows[1]! && !('label' in rows[1]!));
    });
  });
});
