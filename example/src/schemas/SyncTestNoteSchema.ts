import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

export interface SyncTestNote {
  id: number;
  body: string;
  pinned: boolean;
  updatedAt: number;
}

// Second synced schema, alongside SyncTestItemSchema — proves sync_queue/
// triggers/cursor are isolated per entity, and exercises boolean round-trip
// through the sync wire (payload booleans, not just text).
export const SyncTestNoteSchema = {
  name: 'sync_test_notes',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    body: { type: 'text' },
    pinned: { type: 'boolean', default: false },
    updatedAt: { type: 'datetime', nullable: false },
  },
  indexes: [
    { name: 'idx_sync_test_notes_updated_at', columns: ['updatedAt'] },
  ],
  sync: {
    enabled: true,
    direction: 'bidirectional',
    strategy: 'operations',
    conflict: 'lastWriteWins',
    transport: 'rest',
    endpoint: { method: 'POST', path: '/sync/sync_test_notes' },
    pagination: { pageSize: 20, maxPagesPerSession: 20 },
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
} satisfies ISchemaDefinition<SyncTestNote>;
