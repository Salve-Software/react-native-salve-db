import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

export interface Product {
  id: number;
  name: string;
  price: number;
  updatedAt: number;
}

// Mirrors packages/salve-db-server's IProduct — deliberately different
// sinceParam/limitParam names than UserSchema, proving per-module query
// param naming is real, exercised configuration (see salve-db-server's README).
export const ProductSchema = {
  name: 'products',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    name: { type: 'text' },
    price: { type: 'real' },
    updatedAt: { type: 'datetime', nullable: false },
  },
  indexes: [
    { name: 'idx_products_updated_at', columns: ['updatedAt'] },
  ],
  sync: {
    enabled: true,
    direction: 'bidirectional',
    conflict: { strategy: 'lastWriteWins' },
    transport: 'rest',
    endpoint: { basePath: '/products', sinceParam: 'modified_since', limitParam: 'page_size' },
    pagination: { pageSize: 25, maxPagesPerSession: 20 },
  },
} satisfies ISchemaDefinition<Product>;
