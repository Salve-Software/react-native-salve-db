import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

export interface FeedItem {
  id: number;
  title: string;
  createdAt: number;
}

// `satisfies` (not a type annotation) so `columns`' keys stay literal —
// `useInfiniteQuery`'s `InferSelectModel<TSchema>` needs the literal shape to infer real row types.
export const FeedItemSchema = {
  name: 'feed_items',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    title: { type: 'text' },
    createdAt: { type: 'datetime' },
  },
  indexes: [
    { name: 'idx_feed_items_created_at', columns: ['createdAt'] },
  ],
} satisfies ISchemaDefinition<FeedItem>;
