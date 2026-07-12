import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

/** Single-row table (`id` is always `1`) — a denormalized running total kept in sync with `ExpenseSchema` inside a `Database.transaction()`, instead of recomputing `SUM(amountCents)` on every read. */
export interface Budget {
  id: number;
  limitCents: number;
  spentCents: number;
}

// `satisfies` (not a type annotation) so `columns`' keys stay literal —
// `useQuery`'s `InferSelectModel<TSchema>` needs the literal shape to infer real row types.
export const BudgetSchema = {
  name: 'budget',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    limitCents: { type: 'integer' },
    spentCents: { type: 'integer' },
  },
} satisfies ISchemaDefinition<Budget>;
