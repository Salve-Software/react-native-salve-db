import { describe, it, expect } from 'react-native-harness';
import { Database, eq } from '@salve-software/react-native-salve-db';
import type { AnySchema } from '@salve-software/react-native-salve-db';

function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

describe('SalveDb', () => {
  it('exposes Database', () => {
    expect(Database).toBeDefined();
  });
});

describe('Database.configure / register guards', () => {
  it('configure({ name: "" }) throws', () => {
    expect(() => Database.configure({ name: '' })).toThrow(
      "Database.configure: 'name' is required"
    );
  });

  it('register() with primaryKey missing from columns throws', () => {
    Database.configure({ name: uniqueName('e2e_guards_bad') });
    const schema = {
      name: 'bad_schema',
      version: 1,
      primaryKey: 'missing_id',
      columns: { id: { type: 'integer' } },
    } as AnySchema;

    expect(() => Database.register({ schema })).toThrow(
      "Database.register: primaryKey 'missing_id' must exist in schema.columns"
    );
  });

  it('valid configure() + register() actually creates the table', async () => {
    Database.configure({ name: uniqueName('e2e_guards_valid') });
    const schema: AnySchema = {
      name: 'valid_probe',
      version: 1,
      primaryKey: 'id',
      columns: { id: { type: 'integer' } },
    };

    await Database.register({ schema });

    const tables = Database.execute(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?",
      ['valid_probe']
    ) as { name: string }[];
    expect(tables).toHaveLength(1);
  });
});

describe('Migration Engine — ADD COLUMN', () => {
  it('adding a column via version bump preserves existing rows', async () => {
    Database.configure({ name: uniqueName('e2e_migration') });

    const schemaV1: AnySchema = {
      name: 'widgets',
      version: 1,
      primaryKey: 'id',
      columns: {
        id: { type: 'integer' },
        label: { type: 'text' },
      },
    };
    await Database.register({ schema: schemaV1 });
    Database.insert(schemaV1).values({ id: 1, label: 'first' }).execute();

    const schemaV2: AnySchema = {
      name: 'widgets',
      version: 2,
      primaryKey: 'id',
      columns: {
        id: { type: 'integer' },
        label: { type: 'text' },
        note: { type: 'text', nullable: true },
      },
    };
    await Database.register({ schema: schemaV2 });

    const rows = Database.select(schemaV2).where(eq('id', 1)).limit(10).execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: 1, label: 'first', note: null });
  });
});

describe('CRUD round-trip + boolean coercion', () => {
  it('insert -> select round-trips values, including real boolean coercion', async () => {
    Database.configure({ name: uniqueName('e2e_crud') });

    const schema: AnySchema = {
      name: 'accounts',
      version: 1,
      primaryKey: 'id',
      columns: {
        id: { type: 'integer' },
        name: { type: 'text' },
        active: { type: 'boolean' },
      },
    };
    await Database.register({ schema });

    Database.insert(schema).values({ id: 1, name: 'Ana', active: true }).execute();
    Database.insert(schema).values({ id: 2, name: 'Bruno', active: false }).execute();

    const activeRows = Database.select(schema).where(eq('id', 1)).limit(10).execute();
    expect(activeRows).toHaveLength(1);
    expect(activeRows[0].active).toBe(true);
    expect(typeof activeRows[0].active).toBe('boolean');

    const inactiveRows = Database.select(schema).where(eq('id', 2)).limit(10).execute();
    expect(inactiveRows[0].active).toBe(false);
  });
});

describe('Index and limit guards against a real registered schema', () => {
  it('where() on a non-indexed column throws', async () => {
    Database.configure({ name: uniqueName('e2e_guards_index') });

    const schema: AnySchema = {
      name: 'tasks',
      version: 1,
      primaryKey: 'id',
      columns: {
        id: { type: 'integer' },
        title: { type: 'text' },
      },
    };
    await Database.register({ schema });

    expect(() =>
      Database.select(schema).where(eq('title', 'x')).limit(10).execute()
    ).toThrow(
      'Synchronous execute() requires an index covering column "title" as its leading column ' +
        '(schema "tasks"). Declare it in schema.indexes, or remove it from where()/orderBy().'
    );
  });

  it('limit(500) is allowed, limit(501) throws', async () => {
    Database.configure({ name: uniqueName('e2e_guards_limit') });

    const schema: AnySchema = {
      name: 'events',
      version: 1,
      primaryKey: 'id',
      columns: { id: { type: 'integer' } },
    };
    await Database.register({ schema });

    expect(() => Database.select(schema).limit(500).execute()).not.toThrow();
    expect(() => Database.select(schema).limit(501).execute()).toThrow(
      'execute() limit (501) exceeds MAX_SYNC_PAGE_SIZE (500).'
    );
  });
});

describe('update/delete without where() touches the whole table', () => {
  it('update() without where() updates every row', async () => {
    Database.configure({ name: uniqueName('e2e_bulk_update') });

    const schema: AnySchema = {
      name: 'items',
      version: 1,
      primaryKey: 'id',
      columns: {
        id: { type: 'integer' },
        status: { type: 'text' },
      },
    };
    await Database.register({ schema });

    Database.insert(schema).values({ id: 1, status: 'pending' }).execute();
    Database.insert(schema).values({ id: 2, status: 'pending' }).execute();
    Database.insert(schema).values({ id: 3, status: 'pending' }).execute();

    Database.update(schema).set({ status: 'done' }).execute();

    const all = Database.execute('SELECT status FROM "items"') as { status: string }[];
    expect(all).toHaveLength(3);
    expect(all.every((row) => row.status === 'done')).toBe(true);
  });

  it('delete() without where() empties the table', async () => {
    Database.configure({ name: uniqueName('e2e_bulk_delete') });

    const schema: AnySchema = {
      name: 'items',
      version: 1,
      primaryKey: 'id',
      columns: { id: { type: 'integer' } },
    };
    await Database.register({ schema });

    Database.insert(schema).values({ id: 1 }).execute();
    Database.insert(schema).values({ id: 2 }).execute();

    Database.delete(schema).execute();

    const remaining = Database.execute('SELECT COUNT(*) as count FROM "items"') as {
      count: number;
    }[];
    expect(remaining[0].count).toBe(0);
  });
});

describe('transaction() commit and rollback', () => {
  it('commits all writes when the callback succeeds', async () => {
    Database.configure({ name: uniqueName('e2e_tx_commit') });

    const schema: AnySchema = {
      name: 'ledger',
      version: 1,
      primaryKey: 'id',
      columns: {
        id: { type: 'integer' },
        amount: { type: 'integer' },
      },
    };
    await Database.register({ schema });

    Database.transaction((tx) => {
      tx.insert(schema).values({ id: 1, amount: 10 }).execute();
      tx.insert(schema).values({ id: 2, amount: 20 }).execute();
    });

    const rows = Database.execute('SELECT COUNT(*) as count FROM "ledger"') as {
      count: number;
    }[];
    expect(rows[0].count).toBe(2);
  });

  it('rolls back all writes when the callback throws', async () => {
    Database.configure({ name: uniqueName('e2e_tx_rollback') });

    const schema: AnySchema = {
      name: 'ledger',
      version: 1,
      primaryKey: 'id',
      columns: {
        id: { type: 'integer' },
        amount: { type: 'integer' },
      },
    };
    await Database.register({ schema });

    expect(() => {
      Database.transaction((tx) => {
        tx.insert(schema).values({ id: 1, amount: 10 }).execute();
        throw new Error('boom');
      });
    }).toThrow('boom');

    const rows = Database.execute('SELECT COUNT(*) as count FROM "ledger"') as {
      count: number;
    }[];
    expect(rows[0].count).toBe(0);
  });
});

describe('sync_queue side effects from real writes', () => {
  it('insert/update/delete on a sync-enabled schema populate sync_queue', async () => {
    Database.configure({ name: uniqueName('e2e_sync_queue') });

    const schema: AnySchema = {
      name: 'customers',
      version: 1,
      primaryKey: 'id',
      columns: {
        id: { type: 'integer' },
        name: { type: 'text' },
        updatedAt: { type: 'datetime', nullable: false },
      },
      sync: {
        enabled: true,
        direction: 'bidirectional',
        strategy: 'operations',
        conflict: 'lastWriteWins',
        transport: 'rest',
        endpoint: { method: 'POST', path: '/sync/customers' },
        request: {
          body: {
            cursor: { $ref: 'cursor' },
            operations: { $ref: 'operations' },
            pageSize: { $ref: 'pageSize' },
          },
        },
        response: {
          cursor: '$.cursor',
          operations: '$.operations',
          hasMore: '$.hasMore',
        },
      },
    };
    await Database.register({ schema });

    Database.insert(schema).values({ id: 1, name: 'first', updatedAt: Date.now() }).execute();
    Database.update(schema).set({ name: 'renamed' }).where(eq('id', 1)).execute();
    Database.delete(schema).where(eq('id', 1)).execute();

    const queue = Database.execute(
      'SELECT operation, entity FROM sync_queue WHERE entity = ? ORDER BY id',
      ['customers']
    ) as { operation: string; entity: string }[];

    expect(queue).toHaveLength(3);
    expect(queue.map((row) => row.operation)).toEqual(['insert', 'update', 'delete']);
    expect(queue.every((row) => row.entity === 'customers')).toBe(true);
  });
});

describe('subscribeToChanges — real native write notifications', () => {
  it('notifies subscribers with the touched table on write', async () => {
    Database.configure({ name: uniqueName('e2e_subscribe') });

    const schema: AnySchema = {
      name: 'notes',
      version: 1,
      primaryKey: 'id',
      columns: {
        id: { type: 'integer' },
        title: { type: 'text' },
      },
    };
    await Database.register({ schema });

    const seen: string[][] = [];
    const subscriptionId = Database.subscribeToChanges((tables) => seen.push(tables));

    try {
      Database.insert(schema).values({ id: 1, title: 'reactive note' }).execute();
      expect(seen).toEqual([['notes']]);
    } finally {
      Database.unsubscribeFromChanges(subscriptionId);
    }
  });
});
