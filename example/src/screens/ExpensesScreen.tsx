import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Database, and, eq, like, useDatabaseReady, useQuery } from '@salve-software/react-native-salve-db';
import type { Condition } from '@salve-software/react-native-salve-db';
import { ExpenseSchema, type ExpenseCategory } from '../schemas/ExpenseSchema';
import { BudgetSchema } from '../schemas/BudgetSchema';
import { formatCurrency } from '../library/formatCurrency';
import { formatTimestamp } from '../library/formatTimestamp';

const ACCENT = '#5B5FEF';
const DANGER = '#E14F62';
const CATEGORIES: ExpenseCategory[] = ['food', 'transport', 'shopping', 'other'];
const CATEGORY_EMOJI: Record<ExpenseCategory, string> = {
  food: '🍔',
  transport: '🚗',
  shopping: '🛍️',
  other: '📦',
};
const SEED_BUDGET = { id: 1, limitCents: 50_000, spentCents: 0 };

type CategoryFilter = 'all' | ExpenseCategory;

/**
 * One feature, not three stitched-together demos: an expense tracker where
 * every write is a real `Database` call. Adding/removing an expense also
 * debits/credits a running `budget.spentCents` total *in the same
 * `Database.transaction()`* — rolled back if it would blow the budget — so
 * the atomic-transaction guarantee and the CRUD/search/filter UI aren't two
 * separate toy examples, they're the same feature.
 */
function buildExpenseFilter(search: string, category: CategoryFilter, unpaidOnly: boolean): Condition | undefined {
  const parts: Condition[] = [];
  if (category !== 'all') parts.push(eq('category', category));
  if (unpaidOnly) parts.push(eq('paid', false));
  if (search.trim()) parts.push(like('title', `%${search.trim()}%`));

  if (parts.length === 0) return undefined;
  return parts.length === 1 ? parts[0] : and(...parts);
}

export function ExpensesScreen(): React.JSX.Element {
  const { isReady, isLoading, error } = useDatabaseReady();

  const [title, setTitle] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [addError, setAddError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [unpaidOnly, setUnpaidOnly] = useState(false);

  const [categoryTotals, setCategoryTotals] = useState<{ category: string; total: number }[]>([]);

  const { data: expenses, error: expensesError } = useQuery({
    schema: ExpenseSchema,
    queryFn: (q) => {
      const filter = buildExpenseFilter(search, categoryFilter, unpaidOnly);
      return (filter ? q.where(filter) : q).orderBy('createdAt', 'desc').limit(50);
    },
    deps: [search, categoryFilter, unpaidOnly],
  });

  const { data: budgetRows, error: budgetError } = useQuery({
    schema: BudgetSchema,
    queryFn: (q) => q.limit(1),
  });
  const budget = budgetRows?.[0] ?? null;

  // First-run seed: the budget demo needs one row to debit/credit against.
  useEffect(() => {
    if (budgetRows === null || budgetRows.length > 0) return;
    Database.insert(BudgetSchema).values(SEED_BUDGET).execute();
  }, [budgetRows]);

  // Raw SQL `GROUP BY` aggregate — the query builder has no aggregation API,
  // so this is a real escape-hatch use case, not just a `SUM` restated.
  useEffect(() => {
    if (expenses === null) return;
    const rows = Database.execute(
      `SELECT category, SUM(amountCents) as total FROM "${ExpenseSchema.name}" GROUP BY category ORDER BY total DESC`
    ) as { category: string; total: number }[];
    setCategoryTotals(rows);
  }, [expenses]);

  function addExpense() {
    setAddError(null);
    const trimmedTitle = title.trim();
    const amountCents = Math.round(Number(amountInput) * 100);
    if (!trimmedTitle || !Number.isFinite(amountCents) || amountCents <= 0) return;

    try {
      Database.transaction((tx) => {
        const [budgetRow] = tx.select(BudgetSchema).where(eq('id', 1)).limit(1).execute();
        if (!budgetRow) throw new Error('Budget not initialized yet.');

        const nextSpent = budgetRow.spentCents + amountCents;
        if (nextSpent > budgetRow.limitCents) {
          throw new Error(`This would exceed your budget of ${formatCurrency(budgetRow.limitCents)}.`);
        }

        tx.insert(ExpenseSchema)
          .values({ id: Date.now(), title: trimmedTitle, category, amountCents, paid: false, createdAt: Date.now() })
          .execute();
        tx.update(BudgetSchema).set({ spentCents: nextSpent }).where(eq('id', 1)).execute();
      });
      setTitle('');
      setAmountInput('');
    } catch (err) {
      setAddError(err instanceof Error ? err.message : String(err));
    }
  }

  function removeExpense(id: number, amountCents: number) {
    Database.transaction((tx) => {
      tx.delete(ExpenseSchema).where(eq('id', id)).execute();
      const [budgetRow] = tx.select(BudgetSchema).where(eq('id', 1)).limit(1).execute();
      if (budgetRow) {
        tx.update(BudgetSchema)
          .set({ spentCents: Math.max(0, budgetRow.spentCents - amountCents) })
          .where(eq('id', 1))
          .execute();
      }
    });
  }

  function togglePaid(id: number, paid: boolean) {
    Database.update(ExpenseSchema).set({ paid: !paid }).where(eq('id', id)).execute();
  }

  const spentPct = budget ? Math.min(100, Math.round((budget.spentCents / budget.limitCents) * 100)) : 0;
  const overBudget = budget ? budget.spentCents >= budget.limitCents : false;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5FA" />

      <View style={styles.header}>
        <Text style={styles.title}>Expenses</Text>
        <Text style={styles.subtitle}>
          {isReady ? `${expenses?.length ?? 0} shown · powered by Salve DB` : 'Starting database…'}
        </Text>
      </View>

      {!isReady ? (
        <View style={styles.centered}>
          {isLoading ? <ActivityIndicator color={ACCENT} size="large" /> : null}
          {error ? <Text style={styles.errorText}>Failed to start database: {String(error)}</Text> : null}
        </View>
      ) : (
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          {expensesError ? <Text style={styles.errorText}>Query failed: {String(expensesError)}</Text> : null}
          {budgetError ? <Text style={styles.errorText}>Budget query failed: {String(budgetError)}</Text> : null}

          {budget ? (
            <View style={styles.budgetCard}>
              <View style={styles.budgetHeaderRow}>
                <Text style={styles.budgetLabel}>Monthly budget</Text>
                <Text style={[styles.budgetValue, overBudget && styles.budgetValueOver]}>
                  {formatCurrency(budget.spentCents)} / {formatCurrency(budget.limitCents)}
                </Text>
              </View>
              <View style={styles.budgetTrack}>
                <View
                  style={[
                    styles.budgetFill,
                    { width: `${spentPct}%`, backgroundColor: overBudget ? DANGER : ACCENT },
                  ]}
                />
              </View>

              {categoryTotals.length > 0 ? (
                <View style={styles.categoryTotalsRow}>
                  {categoryTotals.map((row) => (
                    <View key={row.category} style={styles.categoryTotalChip}>
                      <Text style={styles.categoryTotalText}>
                        {CATEGORY_EMOJI[row.category as ExpenseCategory] ?? '📦'} {formatCurrency(row.total)}
                      </Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}

          <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
            <View style={styles.filterRow}>
              <TextInput
                style={styles.searchInput}
                placeholder="Search expenses…"
                placeholderTextColor="#9B9DB8"
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
              />
              <Pressable
                onPress={() => setUnpaidOnly((prev) => !prev)}
                style={[styles.unpaidToggle, unpaidOnly && styles.unpaidToggleActive]}
              >
                <Text style={[styles.unpaidToggleText, unpaidOnly && styles.unpaidToggleTextActive]}>Unpaid</Text>
              </Pressable>
            </View>

            <View style={styles.categoryFilterRow}>
              {(['all', ...CATEGORIES] as CategoryFilter[]).map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategoryFilter(c)}
                  style={[styles.categoryChip, categoryFilter === c && styles.categoryChipActive]}
                >
                  <Text style={[styles.categoryChipText, categoryFilter === c && styles.categoryChipTextActive]}>
                    {c === 'all' ? 'All' : `${CATEGORY_EMOJI[c]} ${c}`}
                  </Text>
                </Pressable>
              ))}
            </View>

            {(expenses ?? []).length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>💸</Text>
                <Text style={styles.emptyText}>
                  {search || unpaidOnly || categoryFilter !== 'all'
                    ? 'No expenses match this filter.'
                    : 'No expenses yet — add your first one below.'}
                </Text>
              </View>
            ) : (
              (expenses ?? []).map((item) => (
                <View key={item.id} style={styles.card}>
                  <Pressable onPress={() => togglePaid(item.id, item.paid)} hitSlop={12} style={styles.paidCheckbox}>
                    <View style={[styles.paidCheckboxBox, item.paid && styles.paidCheckboxBoxChecked]}>
                      {item.paid ? <Text style={styles.paidCheckboxMark}>✓</Text> : null}
                    </View>
                  </Pressable>
                  <View style={styles.cardBody}>
                    <Text style={[styles.cardTitle, item.paid && styles.cardTitlePaid]}>{item.title}</Text>
                    <Text style={styles.cardMeta}>
                      {CATEGORY_EMOJI[item.category as ExpenseCategory] ?? '📦'} {item.category} · {formatTimestamp(item.createdAt)}
                    </Text>
                  </View>
                  <Text style={styles.cardAmount}>{formatCurrency(item.amountCents)}</Text>
                  <Pressable
                    onPress={() => removeExpense(item.id, item.amountCents)}
                    hitSlop={12}
                    style={styles.deleteButton}
                  >
                    <Text style={styles.deleteButtonText}>✕</Text>
                  </Pressable>
                </View>
              ))
            )}
          </ScrollView>

          {addError ? <Text style={styles.errorText}>{addError}</Text> : null}

          <View style={styles.composer}>
            <View style={styles.categoryPicker}>
              {CATEGORIES.map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategory(c)}
                  style={[styles.categoryPickerChip, category === c && styles.categoryPickerChipActive]}
                >
                  <Text style={styles.categoryPickerChipText}>{CATEGORY_EMOJI[c]}</Text>
                  <Text style={[styles.categoryPickerChipLabel, category === c && styles.categoryPickerChipLabelActive]}>
                    {c}
                  </Text>
                </Pressable>
              ))}
            </View>

            <TextInput
              style={styles.titleInput}
              placeholder="What did you buy?"
              placeholderTextColor="#9B9DB8"
              value={title}
              onChangeText={setTitle}
              returnKeyType="next"
            />

            <View style={styles.amountRow}>
              <TextInput
                style={styles.amountInput}
                placeholder="Amount ($)"
                placeholderTextColor="#9B9DB8"
                keyboardType="decimal-pad"
                value={amountInput}
                onChangeText={setAmountInput}
                onSubmitEditing={addExpense}
                returnKeyType="done"
              />
              <Pressable
                onPress={addExpense}
                disabled={!title.trim() || !amountInput.trim()}
                style={({ pressed }) => [
                  styles.addButton,
                  (!title.trim() || !amountInput.trim()) && styles.addButtonDisabled,
                  pressed && title.trim() && amountInput.trim() ? styles.addButtonPressed : null,
                ]}
              >
                <Text style={styles.addButtonText}>Add expense</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F5FA' },
  flex: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1C1D3E',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#8A8CA8',
    fontWeight: '500',
  },
  budgetCard: {
    marginHorizontal: 20,
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#2B2D6B',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  budgetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  budgetLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A8CA8',
  },
  budgetValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1C1D3E',
  },
  budgetValueOver: {
    color: DANGER,
  },
  budgetTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F4F5FA',
    overflow: 'hidden',
  },
  budgetFill: {
    height: '100%',
    borderRadius: 4,
  },
  categoryTotalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 12,
  },
  categoryTotalChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F4F5FA',
  },
  categoryTotalText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#8A8CA8',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexGrow: 1,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    height: 40,
    borderRadius: 20,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    fontSize: 13,
    color: '#1C1D3E',
  },
  unpaidToggle: {
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
  },
  unpaidToggleActive: {
    backgroundColor: ACCENT,
  },
  unpaidToggleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8CA8',
  },
  unpaidToggleTextActive: {
    color: '#FFFFFF',
  },
  categoryFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  categoryChip: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  categoryChipActive: {
    backgroundColor: ACCENT,
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8CA8',
    textTransform: 'capitalize',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 10,
    shadowColor: '#2B2D6B',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  paidCheckbox: {
    marginRight: 12,
  },
  paidCheckboxBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D5D6EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidCheckboxBoxChecked: {
    backgroundColor: ACCENT,
    borderColor: ACCENT,
  },
  paidCheckboxMark: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  cardBody: {
    flex: 1,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1D3E',
  },
  cardTitlePaid: {
    textDecorationLine: 'line-through',
    color: '#B4B6D0',
  },
  cardMeta: {
    marginTop: 2,
    fontSize: 11,
    color: '#A6A8C4',
    fontWeight: '500',
    textTransform: 'capitalize',
  },
  cardAmount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1D3E',
    marginRight: 10,
  },
  deleteButton: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F5FA',
  },
  deleteButtonText: {
    fontSize: 12,
    color: '#B4B6D0',
    fontWeight: '700',
  },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 60,
    gap: 8,
  },
  emptyEmoji: {
    fontSize: 36,
  },
  emptyText: {
    fontSize: 14,
    color: '#9B9DB8',
    fontWeight: '500',
    textAlign: 'center',
  },
  errorText: {
    marginHorizontal: 20,
    marginBottom: 8,
    fontSize: 13,
    color: '#E14F62',
    fontWeight: '500',
    textAlign: 'center',
  },
  composer: {
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 16,
    backgroundColor: '#F4F5FA',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E1E2F0',
  },
  categoryPicker: {
    flexDirection: 'row',
    gap: 8,
  },
  categoryPickerChip: {
    flex: 1,
    height: 52,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: '#FFFFFF',
  },
  categoryPickerChipActive: {
    backgroundColor: '#E4E4FB',
  },
  categoryPickerChipText: {
    fontSize: 17,
  },
  categoryPickerChipLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: '#9B9DB8',
    textTransform: 'capitalize',
  },
  categoryPickerChipLabelActive: {
    color: ACCENT,
  },
  titleInput: {
    height: 50,
    borderRadius: 14,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    fontSize: 15,
    color: '#1C1D3E',
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  amountInput: {
    flex: 1,
    height: 50,
    borderRadius: 14,
    paddingHorizontal: 18,
    backgroundColor: '#FFFFFF',
    fontSize: 15,
    color: '#1C1D3E',
  },
  addButton: {
    height: 50,
    paddingHorizontal: 20,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  addButtonPressed: {
    opacity: 0.85,
  },
  addButtonDisabled: {
    backgroundColor: '#C6C7E8',
  },
  addButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '700',
  },
});
