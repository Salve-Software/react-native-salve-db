import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

export interface Note {
  id: number;
  title: string;
  createdAt: number;
}

// `satisfies` (not a type annotation) so `columns`' keys stay literal —
// `useQuery`'s `InferSelectModel<TSchema>` needs the literal shape to infer real row types.
export const NoteSchema = {
  name: 'notes',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    title: { type: 'text' },
    createdAt: { type: 'datetime' },
  },
  indexes: [{ name: 'idx_notes_created_at', columns: ['createdAt'] }],
} satisfies ISchemaDefinition<Note>;
