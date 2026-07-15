import React, { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Database, useDatabaseReady } from '@salve-software/react-native-salve-db';
import { SyncTestItemSchema } from '../schemas/SyncTestItemSchema';
import { SyncTestNoteSchema } from '../schemas/SyncTestNoteSchema';
import { SyncTestTagSchema } from '../schemas/SyncTestTagSchema';
import { SyncEntityPanel } from '../components/SyncEntityPanel';
import { formatTimestamp } from '../library/formatTimestamp';

const ACCENT = '#5B5FEF';

/**
 * Manual test surface for the sync engine (TASK-016's triggers plus push/pull
 * over mock-sync-server/) across three independently-synced schemas — proves
 * sync_queue/triggers/cursor isolation per entity, not just a single-schema
 * demo. Watch mock-sync-server/'s terminal output while using this screen.
 */
export function SyncTestScreen(): React.JSX.Element {
  const { isReady, isLoading, error } = useDatabaseReady();
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function syncAll() {
    setBusy(true);
    setLastResult(null);
    try {
      const results = await Database.syncAll();
      setLastResult(`syncAll() ok — ${results.length} schema(s) synced`);
    } catch (err) {
      setLastResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5FA" />

      <View style={styles.header}>
        <Text style={styles.title}>Sync Test</Text>
        <Text style={styles.subtitle}>
          {isReady ? 'Three independently-synced schemas' : 'Starting database…'}
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
            <Pressable
              style={[styles.button, busy && styles.buttonDisabled]}
              disabled={busy}
              onPress={syncAll}
            >
              <Text style={styles.buttonText}>Sync All</Text>
            </Pressable>
          </View>

          {busy ? <ActivityIndicator color={ACCENT} style={styles.busySpinner} /> : null}
          {lastResult ? (
            <Text style={[styles.resultText, lastResult.startsWith('Error') && styles.errorText]}>
              {lastResult}
            </Text>
          ) : null}

          <ScrollView contentContainerStyle={styles.listContent}>
            <SyncEntityPanel
              schema={SyncTestItemSchema}
              title="Items"
              makeSampleRow={() => ({ id: Date.now(), label: `item ${new Date().toLocaleTimeString()}`, updatedAt: Date.now() })}
              renderItemLabel={(item) => String(item.label)}
              renderItemMeta={(item) => `updated ${formatTimestamp(item.updatedAt as number)}`}
            />

            <SyncEntityPanel
              schema={SyncTestNoteSchema}
              title="Notes"
              makeSampleRow={() => ({ id: Date.now(), body: `note ${new Date().toLocaleTimeString()}`, pinned: false, updatedAt: Date.now() })}
              renderItemLabel={(item) => `${item.pinned ? '📌 ' : ''}${item.body}`}
              renderItemMeta={(item) => `updated ${formatTimestamp(item.updatedAt as number)}`}
            />

            <SyncEntityPanel
              schema={SyncTestTagSchema}
              title="Tags"
              makeSampleRow={() => ({ id: Date.now(), name: `tag ${new Date().toLocaleTimeString()}`, color: null, updatedAt: Date.now() })}
              renderItemLabel={(item) => String(item.name)}
              renderItemMeta={(item) => `color: ${item.color ?? '(none)'} — updated ${formatTimestamp(item.updatedAt as number)}`}
            />
          </ScrollView>

          <Text style={styles.hint}>
            "Simulate server insert" queues a pull-direction operation on mock-sync-server/ via
            POST /admin/seed — tap "Sync this schema" afterwards to pull it down.
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
    backgroundColor: ACCENT,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
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
    color: '#E14F62',
    fontWeight: '500',
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 12,
    flexGrow: 1,
  },
  hint: {
    fontSize: 11,
    color: '#9B9DB8',
    paddingHorizontal: 20,
    paddingBottom: 10,
    fontStyle: 'italic',
  },
});
