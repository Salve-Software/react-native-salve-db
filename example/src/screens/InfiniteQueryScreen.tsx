import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Database, useDatabaseReady, useInfiniteQuery } from '@salve-software/react-native-salve-db';
import { FeedItemSchema } from '../schemas/FeedItemSchema';
import { formatTimestamp } from '../library/formatTimestamp';
import { Button, Card, EmptyState, IconButton, ScreenHeader, useToast } from '../components/ui';
import { colors, spacing, typography } from '../theme/tokens';
import { DotsThreeVerticalIcon, TrayIcon } from '../theme/icons';

const PAGE_SIZE = 10;
const SEED_COUNT = 50;

/**
 * Deliberately small `pageSize` and a seed button so pagination kicks in
 * with a couple of taps, no need to hand-add 20+ rows through a form.
 * `seedItems` batch-inserts via a single `.values(array)` call; `addOne`
 * demonstrates the table triggering a reactive reset back to page 0 through
 * `useInfiniteQuery`'s live-table subscription. `clearAll` deliberately does
 * not (see its own comment) — kept as-is to reproduce that gap on demand.
 */
export function InfiniteQueryScreen(): React.JSX.Element {
  const { isReady, isLoading: dbLoading, error: dbError } = useDatabaseReady();
  const [menuOpen, setMenuOpen] = useState(false);
  const { showError } = useToast();

  const {
    data: items,
    error: itemsError,
    isLoading: itemsLoading,
    hasNextPage,
    fetchNextPage,
  } = useInfiniteQuery({
    schema: FeedItemSchema,
    queryFn: (q) => q.orderBy('createdAt', 'desc'),
    pageSize: PAGE_SIZE,
  });

  useEffect(() => {
    if (itemsError) {
      showError(`Query failed: ${String(itemsError)}`);
    }
  }, [itemsError, showError]);

  function seedItems() {
    setMenuOpen(false);
    const startIndex = Database.count(FeedItemSchema).execute();
    const base = Date.now();
    const rows = Array.from({ length: SEED_COUNT }, (_, i) => ({
      id: startIndex + i,
      title: `Item #${startIndex + i + 1}`,
      createdAt: base + i,
    }));
    Database.insert(FeedItemSchema).values(rows).execute();
  }

  function addOne() {
    setMenuOpen(false);
    const startIndex = Database.count(FeedItemSchema).execute();
    Database.insert(FeedItemSchema)
      .values({ id: startIndex, title: `Item #${startIndex + 1}`, createdAt: Date.now() })
      .execute();
  }

  // Deliberately a bare `DELETE FROM` with no `where()`: on a schema with no `sync`
  // config (so no triggers on the table), this hits SQLite's truncate optimization,
  // which skips the update hook the reactive subscription relies on — the list won't
  // refresh until some other write touches the table.
  function clearAll() {
    setMenuOpen(false);
    Database.delete(FeedItemSchema).execute();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor={colors.canvas} />

      <View style={styles.headerRow}>
        <View style={styles.headerTitle}>
          <ScreenHeader
            title="Infinite Query"
            subtitle={
              isReady
                ? `${items?.length ?? 0} loaded${hasNextPage ? ' · more available' : items && items.length > 0 ? ' · all loaded' : ''}`
                : 'Starting database…'
            }
          />
        </View>
        <View style={styles.headerAction}>
          <IconButton icon={<DotsThreeVerticalIcon size={18} color={colors.ink} />} onPress={() => setMenuOpen((v) => !v)} />
          {menuOpen ? (
            <>
              <Pressable style={styles.menuBackdrop} onPress={() => setMenuOpen(false)} />
              <Card style={styles.menu}>
                <Button variant="text" label={`Seed ${SEED_COUNT}`} onPress={seedItems} />
                <Button variant="text" label="Add one" onPress={addOne} />
                <Button variant="text" label="Clear all" onPress={clearAll} />
              </Card>
            </>
          ) : null}
        </View>
      </View>

      {!isReady ? (
        <View style={styles.centered}>
          {dbLoading ? <ActivityIndicator color={colors.accent} size="large" /> : null}
          {dbError ? <Text style={styles.errorText}>Failed to start database: {String(dbError)}</Text> : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {itemsLoading ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.accent} size="small" />
            </View>
          ) : (items ?? []).length === 0 ? (
            <EmptyState icon={<TrayIcon size={32} color={colors.muted} />} title="No items yet" message="Seed some to test pagination." />
          ) : (
            (items ?? []).map((item) => (
              <Card key={item.id} style={styles.card}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                <Text style={styles.cardMeta}>{formatTimestamp(item.createdAt)}</Text>
              </Card>
            ))
          )}

          {hasNextPage ? <Button variant="ghost" label="Load more" onPress={fetchNextPage} style={styles.loadMoreButton} /> : null}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xxl,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingRight: spacing.lg,
  },
  headerTitle: {
    flex: 1,
  },
  headerAction: {
    marginTop: spacing.md,
  },
  menuBackdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
  },
  menu: {
    position: 'absolute',
    top: 44,
    right: 0,
    width: 160,
    padding: spacing.xs,
    gap: spacing.xxs,
    zIndex: 10,
    elevation: 10,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    flexGrow: 1,
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
  },
  cardTitle: {
    ...typography.body,
    fontWeight: '600',
    color: colors.ink,
  },
  cardMeta: {
    ...typography.caption,
    color: colors.muted,
  },
  loadMoreButton: {
    alignSelf: 'center',
    marginTop: spacing.xs,
  },
  errorText: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 13,
    color: colors.danger,
    fontWeight: '500',
    textAlign: 'center',
  },
});
