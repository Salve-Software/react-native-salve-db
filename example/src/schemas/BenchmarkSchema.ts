import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

export interface BenchmarkRow {
  id: number;
  label: string;
  createdAt: number;
}

// `satisfies` (not a type annotation) so `columns`' keys stay literal —
// `useQuery`'s `InferSelectModel<TSchema>` needs the literal shape to infer real row types.
export const BenchmarkSchema = {
  name: 'benchmark_rows',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    label: { type: 'text' },
    createdAt: { type: 'datetime' },
  },
  indexes: [{ name: 'idx_benchmark_created_at', columns: ['createdAt'] }],
} satisfies ISchemaDefinition<BenchmarkRow>;
