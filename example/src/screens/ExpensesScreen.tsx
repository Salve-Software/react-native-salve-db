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
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Database, and, eq, like, useDatabaseReady, useQuery } from '@salve-software/react-native-salve-db';
import type { Condition } from '@salve-software/react-native-salve-db';
import { ExpenseSchema, type ExpenseCategory } from '../schemas/ExpenseSchema';
import { BudgetSchema } from '../schemas/BudgetSchema';
import { formatCurrency } from '../library/formatCurrency';
import { formatTimestamp } from '../library/formatTimestamp';
import { colors, radius, spacing, typography } from '../theme/tokens';
import { CheckIcon, MagnifyingGlassIcon, PlusIcon, ReceiptIcon, TrashIcon } from '../theme/icons';
import { Button, Card, EmptyState, IconButton, Input, ProgressBar, ScreenHeader, useToast } from '../components/ui';

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
  const toast = useToast();

  const [title, setTitle] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [category, setCategory] = useState<ExpenseCategory>('food');
  const [addError, setAddError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

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

  useEffect(() => {
    if (expensesError) toast.showError(`Query failed: ${String(expensesError)}`);
  }, [expensesError, toast]);

  useEffect(() => {
    if (budgetError) toast.showError(`Budget query failed: ${String(budgetError)}`);
  }, [budgetError, toast]);

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
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.canvas} />

      <ScreenHeader
        title="Query"
        subtitle={isReady ? `${expenses?.length ?? 0} shown · powered by Salve DB` : 'Starting database…'}
      />

      {!isReady ? (
        <View style={styles.centered}>
          {isLoading ? <ActivityIndicator color={colors.accent} size="large" /> : null}
          {error ? <Text style={styles.errorText}>Failed to start database: {String(error)}</Text> : null}
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {budget ? (
            <Card style={styles.budgetCard}>
              <View style={styles.budgetHeaderRow}>
                <Text style={styles.budgetLabel}>Monthly budget</Text>
                <Text style={[styles.budgetValue, overBudget && styles.budgetValueOver]}>
                  {formatCurrency(budget.spentCents)} / {formatCurrency(budget.limitCents)}
                </Text>
              </View>
              <ProgressBar progress={spentPct / 100} tone={overBudget ? 'danger' : 'accent'} />

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
            </Card>
          ) : null}

          <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
            <View style={styles.filterRow}>
              <View style={styles.searchWrapper}>
                <MagnifyingGlassIcon size={16} color={colors.muted} style={styles.searchIcon} />
                <Input
                  style={styles.searchInput}
                  placeholder="Search expenses…"
                  value={search}
                  onChangeText={setSearch}
                  returnKeyType="search"
                />
              </View>
              <Pressable
                onPress={() => setUnpaidOnly((prev) => !prev)}
                style={[styles.chip, unpaidOnly && styles.chipActive]}
              >
                <Text style={[styles.chipText, unpaidOnly && styles.chipTextActive]}>Unpaid</Text>
              </Pressable>
            </View>

            <View style={styles.categoryFilterRow}>
              {(['all', ...CATEGORIES] as CategoryFilter[]).map((c) => (
                <Pressable
                  key={c}
                  onPress={() => setCategoryFilter(c)}
                  style={[styles.chip, categoryFilter === c && styles.chipActive]}
                >
                  <Text style={[styles.chipText, categoryFilter === c && styles.chipTextActive]}>
                    {c === 'all' ? 'All' : `${CATEGORY_EMOJI[c]} ${c}`}
                  </Text>
                </Pressable>
              ))}
            </View>

            {(expenses ?? []).length === 0 ? (
              <EmptyState
                icon={<ReceiptIcon size={32} color={colors.muted} />}
                title={
                  search || unpaidOnly || categoryFilter !== 'all'
                    ? 'No expenses match this filter.'
                    : 'No expenses yet — add your first one below.'
                }
              />
            ) : (
              (expenses ?? []).map((item) => (
                <View key={item.id} style={styles.row}>
                  <Pressable onPress={() => togglePaid(item.id, item.paid)} hitSlop={12} style={styles.paidCheckbox}>
                    <View style={[styles.paidCheckboxBox, item.paid && styles.paidCheckboxBoxChecked]}>
                      {item.paid ? <CheckIcon size={12} color={colors.accentInk} weight="bold" /> : null}
                    </View>
                  </Pressable>
                  <View style={styles.rowBody}>
                    <Text style={[styles.rowTitle, item.paid && styles.rowTitlePaid]}>{item.title}</Text>
                    <Text style={styles.rowMeta}>
                      {CATEGORY_EMOJI[item.category as ExpenseCategory] ?? '📦'} {item.category} ·{' '}
                      {formatTimestamp(item.createdAt)}
                    </Text>
                  </View>
                  <Text style={styles.rowAmount}>{formatCurrency(item.amountCents)}</Text>
                  <IconButton
                    icon={<TrashIcon size={16} color={colors.muted} />}
                    onPress={() => removeExpense(item.id, item.amountCents)}
                  />
                </View>
              ))
            )}
          </ScrollView>

          <View style={styles.composerArea}>
            {composerOpen ? (
              <Card style={styles.composerCard}>
                <View style={styles.categoryPicker}>
                  {CATEGORIES.map((c) => (
                    <Pressable
                      key={c}
                      onPress={() => setCategory(c)}
                      style={[styles.categoryPickerChip, category === c && styles.categoryPickerChipActive]}
                    >
                      <Text style={styles.categoryPickerChipEmoji}>{CATEGORY_EMOJI[c]}</Text>
                      <Text
                        style={[styles.categoryPickerChipLabel, category === c && styles.categoryPickerChipLabelActive]}
                      >
                        {c}
                      </Text>
                    </Pressable>
                  ))}
                </View>

                <Input placeholder="What did you buy?" value={title} onChangeText={setTitle} returnKeyType="next" />

                {addError ? <Text style={styles.errorText}>{addError}</Text> : null}

                <View style={styles.amountRow}>
                  <Input
                    style={styles.amountInput}
                    placeholder="Amount ($)"
                    keyboardType="decimal-pad"
                    value={amountInput}
                    onChangeText={setAmountInput}
                    onSubmitEditing={addExpense}
                    returnKeyType="done"
                  />
                  <Button
                    label="Confirm"
                    onPress={addExpense}
                    disabled={!title.trim() || !amountInput.trim()}
                    style={styles.confirmButton}
                  />
                </View>
              </Card>
            ) : (
              <Button
                label="Add expense"
                icon={<PlusIcon size={18} color={colors.accentInk} />}
                onPress={() => setComposerOpen(true)}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1 },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  budgetCard: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
  },
  budgetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  budgetLabel: { ...typography.label, color: colors.muted },
  budgetValue: { ...typography.label, color: colors.ink },
  budgetValueOver: { color: colors.danger },
  categoryTotalsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  categoryTotalChip: {
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  categoryTotalText: { ...typography.caption, color: colors.muted },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    flexGrow: 1,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  searchWrapper: { flex: 1, justifyContent: 'center' },
  searchIcon: { position: 'absolute', left: spacing.md, zIndex: 1 },
  searchInput: { paddingLeft: spacing.xl + spacing.xs },
  categoryFilterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  chip: {
    paddingVertical: spacing.sm - 1,
    paddingHorizontal: spacing.md,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
  },
  chipActive: { backgroundColor: colors.accent },
  chipText: { ...typography.caption, color: colors.muted, textTransform: 'capitalize' },
  chipTextActive: { color: colors.accentInk },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  paidCheckbox: {},
  paidCheckboxBox: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paidCheckboxBoxChecked: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  rowBody: { flex: 1 },
  rowTitle: { fontSize: 15, fontWeight: '600', color: colors.ink },
  rowTitlePaid: { textDecorationLine: 'line-through', color: colors.muted },
  rowMeta: {
    marginTop: 2,
    ...typography.caption,
    color: colors.muted,
    textTransform: 'capitalize',
  },
  rowAmount: { fontSize: 14, fontWeight: '700', color: colors.ink },
  errorText: {
    marginBottom: spacing.sm,
    fontSize: 13,
    color: colors.danger,
    fontWeight: '500',
    textAlign: 'center',
  },
  composerArea: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  composerCard: { gap: spacing.md },
  categoryPicker: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  categoryPickerChip: {
    flex: 1,
    height: 52,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
    backgroundColor: colors.surface2,
  },
  categoryPickerChipActive: { backgroundColor: colors.accent },
  categoryPickerChipEmoji: { fontSize: 17 },
  categoryPickerChipLabel: {
    ...typography.caption,
    color: colors.muted,
    textTransform: 'capitalize',
  },
  categoryPickerChipLabelActive: { color: colors.accentInk },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  amountInput: { flex: 1 },
  confirmButton: { paddingHorizontal: spacing.lg },
});
