import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import type { AnySchema } from '@salve-software/react-native-salve-db';
import { Database, useQuery } from '@salve-software/react-native-salve-db';
import { MOCK_SYNC_SERVER_BASE_URL } from '../library/mockSyncServer';

const ACCENT = '#5B5FEF';
const DANGER = '#E14F62';

export interface SyncEntityPanelProps {
  schema: AnySchema;
  title: string;
  /** Builds a fresh row for both "Add local item" (inserted directly) and
   * "Simulate server insert" (sent as the seeded operation's payload). */
  makeSampleRow: () => Record<string, unknown>;
  renderItemLabel: (item: Record<string, unknown>) => string;
  renderItemMeta: (item: Record<string, unknown>) => string;
}

/**
 * One synced entity's test surface: local insert (push), manual sync, and a
 * "simulate server insert" button that seeds a pull-direction operation on
 * mock-sync-server/ via POST /admin/seed — lets pull be exercised from the
 * app alone, without a terminal. Parameterized so SyncTestScreen can render
 * one of these per synced schema without repeating this markup.
 */
export function SyncEntityPanel({ schema, title, makeSampleRow, renderItemLabel, renderItemMeta }: SyncEntityPanelProps): React.JSX.Element {
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: items, error: itemsError } = useQuery({
    schema,
    queryFn: (q) => q.orderBy('updatedAt', 'desc').limit(50),
  });

  const [queueCount, setQueueCount] = useState<number>(0);
  const refreshQueueCount = () => {
    const rows = Database.execute(
      'SELECT COUNT(*) as count FROM sync_queue WHERE entity = ?',
      [schema.name]
    ) as { count: number }[];
    setQueueCount(rows[0]?.count ?? 0);
  };

  React.useEffect(() => {
    refreshQueueCount();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  function addLocalItem() {
    // `schema` is typed as the widened `AnySchema` here (this panel is reused
    // across schemas), so InferInsertModel can't narrow to a literal column
    // set — the cast is unavoidable without a generic per-schema panel.
    Database.insert(schema).values(makeSampleRow() as never).execute();
    refreshQueueCount();
  }

  async function runSync() {
    setBusy(true);
    setLastResult(null);
    try {
      const result = await Database.sync(schema.name);
      setLastResult(
        `sync ok — applied ${result.operationsApplied}, cursor ${result.cursor ?? '(none)'}, ${Math.round(result.duration)}ms`
      );
    } catch (err) {
      setLastResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
      refreshQueueCount();
    }
  }

  async function simulateServerInsert() {
    setBusy(true);
    setLastResult(null);
    try {
      const response = await fetch(`${MOCK_SYNC_SERVER_BASE_URL}/admin/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity: schema.name, operation: 'insert', payload: makeSampleRow() }),
      });
      if (!response.ok) throw new Error(`admin/seed responded ${response.status}`);
      setLastResult('Queued a server-side insert — tap "Sync this schema" to pull it down.');
    } catch (err) {
      setLastResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>{queueCount} queued for "{schema.name}"</Text>
      </View>

      <View style={styles.buttonRow}>
        <Pressable style={styles.button} onPress={addLocalItem}>
          <Text style={styles.buttonText}>Add local item</Text>
        </Pressable>
        <Pressable style={styles.button} disabled={busy} onPress={simulateServerInsert}>
          <Text style={styles.buttonText}>Simulate server insert</Text>
        </Pressable>
      </View>

      <View style={styles.buttonRow}>
        <Pressable
          style={[styles.button, styles.buttonPrimary, busy && styles.buttonDisabled]}
          disabled={busy}
          onPress={runSync}
        >
          <Text style={styles.buttonPrimaryText}>Sync this schema</Text>
        </Pressable>
      </View>

      {busy ? <ActivityIndicator color={ACCENT} style={styles.busySpinner} /> : null}
      {lastResult ? (
        <Text style={[styles.resultText, lastResult.startsWith('Error') && styles.errorText]}>
          {lastResult}
        </Text>
      ) : null}
      {itemsError ? <Text style={styles.errorText}>Query failed: {String(itemsError)}</Text> : null}

      {(items ?? []).length === 0 ? (
        <Text style={styles.emptyText}>No local items yet.</Text>
      ) : (
        (items ?? []).map((item) => (
          <View key={String(item[schema.primaryKey as string])} style={styles.itemCard}>
            <Text style={styles.itemTitle}>{renderItemLabel(item)}</Text>
            <Text style={styles.itemMeta}>{renderItemMeta(item)}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginHorizontal: 16,
    marginBottom: 16,
    padding: 16,
  },
  header: {
    marginBottom: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#1C1D3E',
  },
  subtitle: {
    marginTop: 2,
    fontSize: 12,
    color: '#8A8CA8',
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  button: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F5FA',
  },
  buttonPrimary: {
    backgroundColor: ACCENT,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1D3E',
  },
  buttonPrimaryText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  busySpinner: {
    marginTop: 4,
  },
  resultText: {
    marginTop: 8,
    fontSize: 12,
    color: '#4A4D7A',
    fontWeight: '500',
  },
  errorText: {
    marginTop: 8,
    fontSize: 12,
    color: DANGER,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 13,
    color: '#9B9DB8',
    fontWeight: '500',
    textAlign: 'center',
    marginTop: 12,
  },
  itemCard: {
    backgroundColor: '#F4F5FA',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1C1D3E',
  },
  itemMeta: {
    marginTop: 2,
    fontSize: 11,
    color: '#A6A8C4',
    fontWeight: '500',
  },
});
