import { describe, it, expect, waitUntil } from 'react-native-harness';
import { Database, eq } from '@salve-software/react-native-salve-db';
import { NoteSchema } from '../src/schemas/NoteSchema';

async function waitUntilReady() {
  await waitUntil(() => {
    try {
      Database.select(NoteSchema).limit(1).execute();
      return true;
    } catch {
      return false;
    }
  }, { timeout: 10000 });
}

describe('SalveDb', () => {
  it('exposes Database', () => {
    expect(Database).toBeDefined();
  });

  it('round-trips a row through insert/select/update/delete', async () => {
    await waitUntilReady();

    const id = Date.now();
    Database.insert(NoteSchema).values({ id, title: 'harness note', createdAt: id }).execute();

    const inserted = Database.select(NoteSchema).where(eq('id', id)).limit(1).execute();
    expect(inserted).toEqual([{ id, title: 'harness note', createdAt: id }]);

    Database.update(NoteSchema).set({ title: 'updated note' }).where(eq('id', id)).execute();
    const updated = Database.select(NoteSchema).where(eq('id', id)).limit(1).execute();
    expect(updated[0]?.title).toBe('updated note');

    Database.delete(NoteSchema).where(eq('id', id)).execute();
    const afterDelete = Database.select(NoteSchema).where(eq('id', id)).limit(1).execute();
    expect(afterDelete).toEqual([]);
  });

  it('notifies subscribers with the touched table on write', async () => {
    await waitUntilReady();

    const id = Date.now();
    const seen: string[][] = [];
    const subscriptionId = Database.subscribeToChanges((tables) => seen.push(tables));

    try {
      Database.insert(NoteSchema).values({ id, title: 'reactive note', createdAt: id }).execute();
      expect(seen).toEqual([['notes']]);
    } finally {
      Database.unsubscribeFromChanges(subscriptionId);
      Database.delete(NoteSchema).where(eq('id', id)).execute();
    }
  });
});
