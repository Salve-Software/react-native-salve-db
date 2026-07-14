import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

export interface SyncTestItem {
  id: number;
  label: string;
  updatedAt: number;
}

// Temporary schema for manually exercising the sync engine end to end — see
// SyncTestScreen and mock-sync-server.js. `updatedAt` is required by
// registerSchema whenever sync.enabled is true (used for lastWriteWins).
export const SyncTestItemSchema = {
  name: 'sync_test_items',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    label: { type: 'text' },
    updatedAt: { type: 'datetime', nullable: false },
  },
  indexes: [
    { name: 'idx_sync_test_items_updated_at', columns: ['updatedAt'] },
  ],
  sync: {
    enabled: true,
    direction: 'bidirectional',
    strategy: 'operations',
    conflict: 'lastWriteWins',
    transport: 'rest',
    endpoint: { method: 'POST', path: '/sync/sync_test_items' },
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
} satisfies ISchemaDefinition<SyncTestItem>;
