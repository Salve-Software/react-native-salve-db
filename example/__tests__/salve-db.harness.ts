import { describe, it, expect, beforeAll, beforeEach } from 'react-native-harness'
import { Database, eq, gte } from 'react-native-salve-db'
import type { ISchemaDefinition } from 'react-native-salve-db'

const ItemSchema = {
  name: 'harness_items',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    label: { type: 'text' },
    amount: { type: 'real' },
    active: { type: 'boolean' },
    payload: { type: 'blob', nullable: true },
    createdAt: { type: 'datetime' },
  },
} as const satisfies ISchemaDefinition<any>

describe('SalveDatabase', () => {
  beforeAll(async () => {
    Database.configure({ name: 'harness_test' })
    await Database.register({ schema: ItemSchema })
  })

  beforeEach(async () => {
    await Database.execute('DELETE FROM "harness_items"')
  })

  it('opens with WAL journal mode and foreign keys enabled', async () => {
    const journalMode = (await Database.execute('PRAGMA journal_mode')) as Array<{ journal_mode: string }>
    const foreignKeys = (await Database.execute('PRAGMA foreign_keys')) as Array<{ foreign_keys: number }>

    expect(String(journalMode[0]?.journal_mode).toLowerCase()).toBe('wal')
    expect(foreignKeys[0]?.foreign_keys).toBe(1)
  })

  it('configure + register creates the table', async () => {
    const rows = await Database.execute(
      'SELECT name FROM sqlite_master WHERE type = ? AND name = ?',
      ['table', 'harness_items'],
    )
    expect(rows.length).toBe(1)
  })

  it('inserts and selects a row, round-tripping every column type', async () => {
    const payload = new Uint8Array([1, 2, 3, 4]).buffer

    await Database.insert(ItemSchema)
      .values({
        id: 1,
        label: 'widget',
        amount: 9.99,
        active: true,
        payload,
        createdAt: 1700000000000,
      })
      .execute()

    const rows = await Database.select(ItemSchema).where(eq('id', 1)).execute()
    expect(rows.length).toBe(1)

    const row = rows[0]!
    expect(row.label).toBe('widget')
    expect(row.amount).toBe(9.99)
    expect(row.active).toBe(true)
    expect(row.createdAt).toBe(1700000000000)
    expect(Array.from(new Uint8Array(row.payload as unknown as ArrayBuffer))).toEqual([1, 2, 3, 4])
  })

  it('updates a row', async () => {
    await Database.insert(ItemSchema)
      .values({ id: 2, label: 'a', amount: 1, active: false, createdAt: 1 })
      .execute()

    await Database.update(ItemSchema).set({ label: 'b' }).where(eq('id', 2)).execute()

    const rows = await Database.select(ItemSchema).where(eq('id', 2)).execute()
    expect(rows[0]?.label).toBe('b')
  })

  it('deletes a row', async () => {
    await Database.insert(ItemSchema)
      .values({ id: 3, label: 'x', amount: 1, active: false, createdAt: 1 })
      .execute()

    await Database.delete(ItemSchema).where(eq('id', 3)).execute()

    const rows = await Database.select(ItemSchema).where(eq('id', 3)).execute()
    expect(rows.length).toBe(0)
  })

  it('commits a transaction', async () => {
    await Database.transaction(async (tx) => {
      await tx
        .insert(ItemSchema)
        .values({ id: 4, label: 'tx-commit', amount: 1, active: true, createdAt: 1 })
        .execute()
    })

    const rows = await Database.select(ItemSchema).where(eq('id', 4)).execute()
    expect(rows.length).toBe(1)
  })

  it('rolls back a transaction on error', async () => {
    let threw = false
    try {
      await Database.transaction(async (tx) => {
        await tx
          .insert(ItemSchema)
          .values({ id: 5, label: 'tx-rollback', amount: 1, active: true, createdAt: 1 })
          .execute()
        throw new Error('boom')
      })
    } catch {
      threw = true
    }

    expect(threw).toBe(true)

    const rows = await Database.select(ItemSchema).where(eq('id', 5)).execute()
    expect(rows.length).toBe(0)
  })

  it('executes repeated inserts of the same SQL shape without error', async () => {
    for (let i = 10; i < 20; i++) {
      await Database.insert(ItemSchema)
        .values({ id: i, label: `bulk-${i}`, amount: i, active: i % 2 === 0, createdAt: i })
        .execute()
    }

    const rows = await Database.select(ItemSchema).where(gte('id', 10)).execute()
    expect(rows.length).toBe(10)
  })
})
