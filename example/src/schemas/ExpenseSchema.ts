import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

export type ExpenseCategory = 'food' | 'transport' | 'shopping' | 'other';

export interface Expense {
  id: number;
  title: string;
  category: ExpenseCategory;
  amountCents: number;
  paid: boolean;
  createdAt: number;
}

// `satisfies` (not a type annotation) so `columns`' keys stay literal —
// `useQuery`'s `InferSelectModel<TSchema>` needs the literal shape to infer real row types.
export const ExpenseSchema = {
  name: 'expenses',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    title: { type: 'text' },
    category: { type: 'text', default: 'other' },
    amountCents: { type: 'integer' },
    paid: { type: 'boolean', default: false },
    createdAt: { type: 'datetime' },
  },
  indexes: [
    { name: 'idx_expenses_title', columns: ['title'] },
    { name: 'idx_expenses_category', columns: ['category'] },
    { name: 'idx_expenses_paid', columns: ['paid'] },
    { name: 'idx_expenses_created_at', columns: ['createdAt'] },
  ],
} satisfies ISchemaDefinition<Expense>;
