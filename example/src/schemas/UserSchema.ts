import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

export interface User {
  id: number;
  name: string;
  email: string;
  updatedAt: number;
}

// Mirrors packages/salve-db-server's IUser — SyncTestScreen syncs against
// the real /users module there, not a mock.
export const UserSchema = {
  name: 'users',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    name: { type: 'text' },
    email: { type: 'text' },
    updatedAt: { type: 'datetime', nullable: false },
  },
  indexes: [
    { name: 'idx_users_updated_at', columns: ['updatedAt'] },
    { name: 'idx_users_email', columns: ['email'] },
  ],
  sync: {
    enabled: true,
    direction: 'bidirectional',
    conflict: { strategy: 'lastWriteWins' },
    transport: 'rest',
    endpoint: { basePath: '/users', sinceParam: 'updatedAfter', limitParam: 'limit' },
    pagination: { pageSize: 50, maxPagesPerSession: 20 },
  },
} satisfies ISchemaDefinition<User>;
