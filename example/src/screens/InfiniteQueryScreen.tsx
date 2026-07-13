import React from 'react';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Database, useDatabaseReady, useInfiniteQuery } from '@salve-software/react-native-salve-db';
import { FeedItemSchema } from '../schemas/FeedItemSchema';
import { formatTimestamp } from '../library/formatTimestamp';

const ACCENT = '#5B5FEF';
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

  function seedItems() {
    const startIndex = Database.count(FeedItemSchema).execute();
    const base = Date.now();
    const rows = Array.from({ length: SEED_COUNT }, (_, i) => ({
      id: base + i,
      title: `Item #${startIndex + i + 1}`,
      createdAt: base + i,
    }));
    Database.insert(FeedItemSchema).values(rows).execute();
  }

  function addOne() {
    const startIndex = Database.count(FeedItemSchema).execute();
    Database.insert(FeedItemSchema)
      .values({ id: Date.now(), title: `Item #${startIndex + 1}`, createdAt: Date.now() })
      .execute();
  }

  // Deliberately a bare `DELETE FROM` with no `where()`: on a schema with no `sync`
  // config (so no triggers on the table), this hits SQLite's truncate optimization,
  // which skips the update hook the reactive subscription relies on — the list won't
  // refresh until some other write touches the table.
  function clearAll() {
    Database.delete(FeedItemSchema).execute();
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5FA" />

      <View style={styles.header}>
        <Text style={styles.title}>Infinite Query</Text>
        <Text style={styles.subtitle}>
          {isReady
            ? `${items?.length ?? 0} loaded${hasNextPage ? ' · more available' : items && items.length > 0 ? ' · all loaded' : ''}`
            : 'Starting database…'}
        </Text>
      </View>

      {!isReady ? (
        <View style={styles.centered}>
          {dbLoading ? <ActivityIndicator color={ACCENT} size="large" /> : null}
          {dbError ? <Text style={styles.errorText}>Failed to start database: {String(dbError)}</Text> : null}
        </View>
      ) : (
        <>
          <View style={styles.controlsRow}>
            <Pressable onPress={seedItems} style={styles.controlButton}>
              <Text style={styles.controlButtonText}>Seed {SEED_COUNT}</Text>
            </Pressable>
            <Pressable onPress={addOne} style={styles.controlButton}>
              <Text style={styles.controlButtonText}>Add one</Text>
            </Pressable>
            <Pressable onPress={clearAll} style={[styles.controlButton, styles.clearButton]}>
              <Text style={[styles.controlButtonText, styles.clearButtonText]}>Clear all</Text>
            </Pressable>
          </View>

          {itemsError ? <Text style={styles.errorText}>Query failed: {String(itemsError)}</Text> : null}

          <ScrollView contentContainerStyle={styles.listContent}>
            {itemsLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={ACCENT} size="small" />
              </View>
            ) : (items ?? []).length === 0 ? (
              <View style={styles.empty}>
                <Text style={styles.emptyEmoji}>📭</Text>
                <Text style={styles.emptyText}>No items yet — seed some to test pagination.</Text>
              </View>
            ) : (
              (items ?? []).map((item) => (
                <View key={item.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{item.title}</Text>
                  <Text style={styles.cardMeta}>{formatTimestamp(item.createdAt)}</Text>
                </View>
              ))
            )}

            {hasNextPage ? (
              <Pressable onPress={fetchNextPage} style={styles.loadMoreButton}>
                <Text style={styles.loadMoreButtonText}>Load more</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F5FA' },
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
  controlsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  controlButton: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  controlButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: ACCENT,
  },
  clearButton: {
    backgroundColor: '#FDEBEE',
  },
  clearButtonText: {
    color: '#E14F62',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    flexGrow: 1,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
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
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1C1D3E',
  },
  cardMeta: {
    fontSize: 11,
    color: '#A6A8C4',
    fontWeight: '500',
  },
  loadMoreButton: {
    alignSelf: 'center',
    marginTop: 4,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
  },
  loadMoreButtonText: {
    fontSize: 13,
    fontWeight: '600',
    color: ACCENT,
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
});
