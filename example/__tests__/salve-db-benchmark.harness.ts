import { describe, it, expect } from 'react-native-harness';
import { Database, gte, like } from '@salve-software/react-native-salve-db';
import type { AnySchema } from '@salve-software/react-native-salve-db';

function uniqueName(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
}

/**
 * These aren't strict perf SLAs — device/emulator hardware varies too much
 * for that. The ceilings below are generous on purpose: they exist to catch
 * a real regression (e.g. an accidental O(n²) in a future change to the
 * trigger engine or query executor), not to enforce a target latency.
 * The `console.log` lines are the actual signal a human reads.
 */
describe('Performance — bulk writes and indexed reads on a real device', () => {
  const ROW_COUNT = 5_000;

  const schema: AnySchema = {
    name: uniqueName('bench_rows'),
    version: 1,
    primaryKey: 'id',
    columns: {
      id: { type: 'integer' },
      label: { type: 'text' },
      createdAt: { type: 'datetime' },
    },
    indexes: [{ name: 'idx_bench_created_at', columns: ['createdAt'] }],
  };

  it(`inserts ${ROW_COUNT} rows inside a single transaction and reports throughput`, async () => {
    Database.configure({ name: uniqueName('e2e_bench_bulk') });
    await Database.register({ schema });

    const start = Date.now();
    Database.transaction((tx) => {
      for (let i = 0; i < ROW_COUNT; i++) {
        tx.insert(schema).values({ id: i, label: `row_${i}`, createdAt: Date.now() }).execute();
      }
    });
    const elapsedMs = Date.now() - start;
    const rowsPerSecond = Math.round(ROW_COUNT / (elapsedMs / 1000));

    console.log(`[benchmark] inserted ${ROW_COUNT} rows in one transaction: ${elapsedMs}ms (${rowsPerSecond} rows/sec)`);

    const [{ count }] = Database.execute(`SELECT COUNT(*) as count FROM "${schema.name}"`) as { count: number }[];
    expect(count).toBe(ROW_COUNT);

    // Generous ceiling — a real O(n²) regression would blow past this by an order of magnitude.
    expect(elapsedMs).toBeLessThan(20_000);
  });

  it('an indexed, paginated select() over a large table stays fast', async () => {
    Database.configure({ name: uniqueName('e2e_bench_indexed_select') });
    await Database.register({ schema });

    Database.transaction((tx) => {
      for (let i = 0; i < ROW_COUNT; i++) {
        tx.insert(schema).values({ id: i, label: `row_${i}`, createdAt: i }).execute();
      }
    });

    const start = Date.now();
    const rows = Database.select(schema)
      .where(gte('createdAt', ROW_COUNT - 500))
      .orderBy('createdAt', 'asc')
      .limit(500)
      .execute();
    const elapsedMs = Date.now() - start;

    console.log(`[benchmark] indexed select() of 500 rows out of ${ROW_COUNT} took ${elapsedMs}ms`);

    expect(rows).toHaveLength(500);
    expect(rows[0]).toMatchObject({ id: ROW_COUNT - 500 });
    expect(rows[499]).toMatchObject({ id: ROW_COUNT - 1 });
    expect(elapsedMs).toBeLessThan(1_000);
  });

  it('an un-indexed raw SQL scan is measurably slower than the indexed query builder path', async () => {
    Database.configure({ name: uniqueName('e2e_bench_scan_vs_index') });
    await Database.register({ schema });

    Database.transaction((tx) => {
      for (let i = 0; i < ROW_COUNT; i++) {
        tx.insert(schema).values({ id: i, label: `row_${i}`, createdAt: i }).execute();
      }
    });

    // `like('label', ...)` on a non-indexed column: the query builder's synchronous
    // execute() would refuse this (see `assertIndexedColumns`), so this reaches
    // through the raw SQL escape hatch instead — the one path that can still force
    // a full table scan on purpose, to prove the guard is protecting something real.
    expect(() => Database.select(schema).where(like('label', 'row_4%')).limit(500).execute()).toThrow(
      'Synchronous execute() requires an index covering column "label"'
    );

    const scanStart = Date.now();
    const scanned = Database.execute(`SELECT * FROM "${schema.name}" WHERE "label" LIKE ?`, ['row_4%']) as unknown[];
    const scanElapsedMs = Date.now() - scanStart;

    const indexStart = Date.now();
    const indexed = Database.select(schema).where(gte('createdAt', ROW_COUNT - 500)).orderBy('createdAt', 'asc').limit(500).execute();
    const indexElapsedMs = Date.now() - indexStart;

    console.log(
      `[benchmark] unindexed LIKE scan matched ${scanned.length} of ${ROW_COUNT} rows in ${scanElapsedMs}ms vs ` +
      `indexed range select of ${indexed.length} rows in ${indexElapsedMs}ms`
    );

    expect(scanned.length).toBeGreaterThan(0);
    expect(indexed).toHaveLength(500);
  });
});
