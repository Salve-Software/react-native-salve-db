import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Database, useDatabaseReady, useQuery } from '@salve-software/react-native-salve-db';
import { SyncTestItemSchema } from '../schemas/SyncTestItemSchema';
import { formatTimestamp } from '../library/formatTimestamp';

const ACCENT = '#5B5FEF';
const DANGER = '#E14F62';

/**
 * Manual test surface for TASK-016 (Database.sync/syncAll, the AppState
 * app-open trigger, and the native Android/iOS connectivity monitor) — not
 * a feature demo, a debugging tool. Watch mock-sync-server.js's terminal
 * output while using this screen: every sync session (manual, app-open, or
 * connectivity-triggered) shows up there as a real HTTP request, regardless
 * of which of the three triggers fired it.
 */
export function SyncTestScreen(): React.JSX.Element {
  const { isReady, isLoading, error } = useDatabaseReady();
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: items, error: itemsError } = useQuery({
    schema: SyncTestItemSchema,
    queryFn: (q) => q.orderBy('updatedAt', 'desc').limit(50),
  });

  const [queueCount, setQueueCount] = useState<number>(0);
  const refreshQueueCount = () => {
    const rows = Database.execute(
      'SELECT COUNT(*) as count FROM sync_queue WHERE entity = ?',
      ['sync_test_items']
    ) as { count: number }[];
    setQueueCount(rows[0]?.count ?? 0);
  };

  React.useEffect(() => {
    if (isReady) refreshQueueCount();
  }, [isReady, items]);

  function addLocalItem() {
    Database.insert(SyncTestItemSchema)
      .values({ id: Date.now(), label: `item ${new Date().toLocaleTimeString()}`, updatedAt: Date.now() })
      .execute();
    refreshQueueCount();
  }

  async function runSync(kind: 'single' | 'all') {
    setBusy(true);
    setLastResult(null);
    try {
      if (kind === 'single') {
        const result = await Database.sync('sync_test_items');
        setLastResult(
          `sync('sync_test_items') ok — applied ${result.operationsApplied}, cursor ${result.cursor ?? '(none)'}, ${Math.round(result.duration)}ms`
        );
      } else {
        const results = await Database.syncAll();
        setLastResult(`syncAll() ok — ${results.length} schema(s) synced`);
      }
    } catch (err) {
      setLastResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      refreshQueueCount();
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5FA" />

      <View style={styles.header}>
        <Text style={styles.title}>Sync Test</Text>
        <Text style={styles.subtitle}>
          {isReady ? `${queueCount} queued for "sync_test_items"` : 'Starting database…'}
        </Text>
      </View>

      {!isReady ? (
        <View style={styles.centered}>
          {isLoading ? <ActivityIndicator color={ACCENT} size="large" /> : null}
          {error ? <Text style={styles.errorText}>Failed to start database: {String(error)}</Text> : null}
        </View>
      ) : (
        <>
          <View style={styles.buttonRow}>
            <Pressable style={styles.button} onPress={addLocalItem}>
              <Text style={styles.buttonText}>Add local item</Text>
            </Pressable>
          </View>

          <View style={styles.buttonRow}>
            <Pressable
              style={[styles.button, styles.buttonPrimary, busy && styles.buttonDisabled]}
              disabled={busy}
              onPress={() => runSync('single')}
            >
              <Text style={styles.buttonPrimaryText}>Sync this schema</Text>
            </Pressable>
            <Pressable
              style={[styles.button, styles.buttonPrimary, busy && styles.buttonDisabled]}
              disabled={busy}
              onPress={() => runSync('all')}
            >
              <Text style={styles.buttonPrimaryText}>Sync all</Text>
            </Pressable>
          </View>

          {busy ? <ActivityIndicator color={ACCENT} style={styles.busySpinner} /> : null}
          {lastResult ? (
            <Text style={[styles.resultText, lastResult.startsWith('Error') && styles.errorText]}>
              {lastResult}
            </Text>
          ) : null}
          {itemsError ? <Text style={styles.errorText}>Query failed: {String(itemsError)}</Text> : null}

          <ScrollView contentContainerStyle={styles.listContent}>
            {(items ?? []).length === 0 ? (
              <Text style={styles.emptyText}>No local items yet.</Text>
            ) : (
              (items ?? []).map((item) => (
                <View key={item.id} style={styles.card}>
                  <Text style={styles.cardTitle}>{item.label}</Text>
                  <Text style={styles.cardMeta}>updated {formatTimestamp(item.updatedAt)}</Text>
                </View>
              ))
            )}
          </ScrollView>

          <Text style={styles.hint}>
            Foreground/background the app or toggle airplane mode (with the app foregrounded) and
            watch mock-sync-server.js's terminal — every trigger shows up there as a request.
          </Text>
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
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  button: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  buttonPrimary: {
    backgroundColor: ACCENT,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1C1D3E',
  },
  buttonPrimaryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  busySpinner: {
    marginTop: 4,
  },
  resultText: {
    marginHorizontal: 20,
    marginTop: 8,
    fontSize: 12,
    color: '#4A4D7A',
    fontWeight: '500',
  },
  errorText: {
    marginHorizontal: 20,
    marginTop: 8,
    fontSize: 13,
    color: DANGER,
    fontWeight: '500',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 12,
    flexGrow: 1,
  },
  emptyText: {
    fontSize: 14,
    color: '#9B9DB8',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 30,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom: 8,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1D3E',
  },
  cardMeta: {
    marginTop: 2,
    fontSize: 11,
    color: '#A6A8C4',
    fontWeight: '500',
  },
  hint: {
    fontSize: 11,
    color: '#9B9DB8',
    paddingHorizontal: 20,
    paddingBottom: 10,
    fontStyle: 'italic',
  },
});
