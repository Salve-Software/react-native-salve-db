import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

export interface SyncTestTag {
  id: number;
  name: string;
  color: string | null;
  updatedAt: number;
}

// Third synced schema, alongside SyncTestItemSchema/SyncTestNoteSchema —
// exercises a nullable column round-tripping through the sync wire
// (payload `color: null`), on top of the multi-entity isolation coverage.
export const SyncTestTagSchema = {
  name: 'sync_test_tags',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    name: { type: 'text' },
    color: { type: 'text', nullable: true },
    updatedAt: { type: 'datetime', nullable: false },
  },
  indexes: [
    { name: 'idx_sync_test_tags_updated_at', columns: ['updatedAt'] },
  ],
  sync: {
    enabled: true,
    direction: 'bidirectional',
    strategy: 'operations',
    conflict: 'lastWriteWins',
    transport: 'rest',
    endpoint: { method: 'POST', path: '/sync/sync_test_tags' },
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
} satisfies ISchemaDefinition<SyncTestTag>;
