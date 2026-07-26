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
import type { KeyboardTypeOptions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AnySchema } from '@salve-software/react-native-salve-db';
import { Database, eq, useDatabaseReady, useQuery } from '@salve-software/react-native-salve-db';
import { UserSchema } from '../schemas/UserSchema';
import { ProductSchema } from '../schemas/ProductSchema';
import { SYNC_SERVER_BASE_URL } from '../library/syncServer';
import { formatTimestamp } from '../library/formatTimestamp';

const ACCENT = '#5B5FEF';
const DANGER = '#E14F62';

interface StatusCounts {
  [status: string]: number;
}

function formatCounts(counts: StatusCounts): string {
  const entries = Object.entries(counts);
  return entries.length === 0 ? 'none' : entries.map(([status, count]) => `${status} ${count}`).join(' · ');
}

/** Re-reads sync_queue/_salve_sync_metadata status breakdowns whenever `refreshKey` changes — surfaces PENDING/FAILED/BLOCKED and SYNCED/DELETED without opening the DB by hand. */
function useSyncStateCounts(entity: string, refreshKey: unknown): { queue: StatusCounts; metadata: StatusCounts } {
  const [queue, setQueue] = useState<StatusCounts>({});
  const [metadata, setMetadata] = useState<StatusCounts>({});

  useEffect(() => {
    const queueRows = Database.execute(
      'SELECT status, COUNT(*) as count FROM sync_queue WHERE entity = ? GROUP BY status',
      [entity]
    ) as { status: string; count: number }[];
    setQueue(Object.fromEntries(queueRows.map((row) => [row.status, row.count])));

    const metadataRows = Database.execute(
      'SELECT status, COUNT(*) as count FROM _salve_sync_metadata WHERE tableName = ? GROUP BY status',
      [entity]
    ) as { status: string; count: number }[];
    setMetadata(Object.fromEntries(metadataRows.map((row) => [row.status, row.count])));
  }, [entity, refreshKey]);

  return { queue, metadata };
}

interface FieldConfig {
  key: string;
  label: string;
  keyboardType?: KeyboardTypeOptions;
  parse?: (raw: string) => unknown;
}

interface EntityPanelProps {
  schema: AnySchema;
  title: string;
  basePath: string;
  fields: FieldConfig[];
  renderItemLabel: (item: Record<string, unknown>) => string;
  renderItemMeta: (item: Record<string, unknown>) => string;
  sampleServerPayload: () => Record<string, unknown>;
}

function emptyValues(fields: FieldConfig[]): Record<string, string> {
  return Object.fromEntries(fields.map((field) => [field.key, '']));
}

/**
 * One synced entity's manual test surface: local insert/edit/delete (push),
 * a direct server-side write via fetch (pull), and a sync_queue/metadata
 * status breakdown — parameterized so the two schemas below don't duplicate
 * ~150 lines of identical list/composer/sync wiring.
 */
function EntityPanel({ schema, title, basePath, fields, renderItemLabel, renderItemMeta, sampleServerPayload }: EntityPanelProps): React.JSX.Element {
  const { data: items, error: itemsError } = useQuery({
    schema,
    queryFn: (q) => q.orderBy('updatedAt', 'desc').limit(50),
  });

  const [values, setValues] = useState<Record<string, string>>(emptyValues(fields));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const { queue: queueCounts, metadata: metadataCounts } = useSyncStateCounts(schema.name, items);

  function startEdit(item: Record<string, unknown>) {
    setEditingId(item[schema.primaryKey as string] as number);
    setValues(Object.fromEntries(fields.map((field) => [field.key, String(item[field.key] ?? '')])));
  }

  function cancelEdit() {
    setEditingId(null);
    setValues(emptyValues(fields));
  }

  function buildPayload(): Record<string, unknown> {
    return Object.fromEntries(
      fields.map((field) => [field.key, (field.parse ?? ((raw: string) => raw))(values[field.key] ?? '')])
    );
  }

  function submit() {
    const payload = buildPayload();
    if (editingId === null) {
      Database.insert(schema).values({ id: Date.now(), ...payload, updatedAt: Date.now() } as never).execute();
    } else {
      Database.update(schema).set({ ...payload, updatedAt: Date.now() } as never).where(eq('id', editingId)).execute();
    }
    cancelEdit();
  }

  function removeItem(id: number) {
    Database.delete(schema).where(eq('id', id)).execute();
    if (editingId === id) cancelEdit();
  }

  async function runSync() {
    setBusy(true);
    setLastResult(null);
    try {
      const result = await Database.sync(schema.name);
      setLastResult(
        `sync ok — inserted ${result.inserted}, updated ${result.updated}, deleted ${result.deleted}, cursor ${result.cursor ?? '(none)'}, ${Math.round(result.duration)}ms`
      );
    } catch (err) {
      setLastResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function writeDirectlyOnServer() {
    setBusy(true);
    setLastResult(null);
    try {
      const response = await fetch(`${SYNC_SERVER_BASE_URL}${basePath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleServerPayload()),
      });
      if (!response.ok) throw new Error(`${basePath} responded ${response.status}`);
      setLastResult('Wrote directly to the server — tap "Sync this entity" to pull it down.');
    } catch (err) {
      setLastResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = fields.every((field) => (values[field.key] ?? '').trim().length > 0);

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.subtitle}>sync_queue: {formatCounts(queueCounts)}</Text>
        <Text style={styles.subtitle}>metadata: {formatCounts(metadataCounts)}</Text>
      </View>

      <View style={styles.buttonRow}>
        <Pressable style={styles.button} disabled={busy} onPress={writeDirectlyOnServer}>
          <Text style={styles.buttonText}>Write directly on server</Text>
        </Pressable>
        <Pressable
          style={[styles.button, styles.buttonPrimary, busy && styles.buttonDisabled]}
          disabled={busy}
          onPress={runSync}
        >
          <Text style={styles.buttonPrimaryText}>Sync this entity</Text>
        </Pressable>
      </View>

      {busy ? <ActivityIndicator color={ACCENT} style={styles.busySpinner} /> : null}
      {lastResult ? (
        <Text style={[styles.resultText, lastResult.startsWith('Error') && styles.errorText]}>{lastResult}</Text>
      ) : null}
      {itemsError ? <Text style={styles.errorText}>Query failed: {String(itemsError)}</Text> : null}

      {(items ?? []).length === 0 ? (
        <Text style={styles.emptyText}>No local items yet.</Text>
      ) : (
        (items ?? []).map((item) => {
          const id = item[schema.primaryKey as string] as number;
          return (
            <View key={String(id)} style={styles.itemCard}>
              <View style={styles.itemBody}>
                <Text style={styles.itemTitle}>{renderItemLabel(item)}</Text>
                <Text style={styles.itemMeta}>{renderItemMeta(item)}</Text>
              </View>
              <Pressable onPress={() => startEdit(item)} hitSlop={10} style={styles.itemAction}>
                <Text style={styles.itemActionText}>✎</Text>
              </Pressable>
              <Pressable onPress={() => removeItem(id)} hitSlop={10} style={styles.itemAction}>
                <Text style={styles.itemActionTextDanger}>✕</Text>
              </Pressable>
            </View>
          );
        })
      )}

      <View style={styles.composer}>
        {editingId !== null ? (
          <View style={styles.editingRow}>
            <Text style={styles.editingLabel}>Editing #{editingId}</Text>
            <Pressable onPress={cancelEdit}>
              <Text style={styles.editingCancel}>Cancel</Text>
            </Pressable>
          </View>
        ) : null}

        {fields.map((field) => (
          <TextInput
            key={field.key}
            style={styles.input}
            placeholder={field.label}
            placeholderTextColor="#9B9DB8"
            keyboardType={field.keyboardType}
            value={values[field.key] ?? ''}
            onChangeText={(text) => setValues((prev) => ({ ...prev, [field.key]: text }))}
          />
        ))}

        <Pressable
          onPress={submit}
          disabled={!canSubmit}
          style={[styles.addButton, !canSubmit && styles.buttonDisabled]}
        >
          <Text style={styles.addButtonText}>{editingId === null ? 'Add local item' : 'Save changes'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Manual test surface for the sync engine against packages/salve-db-server's real REST API — Users and Products, each with independently-named sinceParam/limitParam. */
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

      <View style={styles.screenHeader}>
        <Text style={styles.screenTitle}>Sync Test</Text>
        <Text style={styles.screenSubtitle}>
          {isReady ? 'Users + Products against salve-db-server' : 'Starting database…'}
        </Text>
      </View>

      {!isReady ? (
        <View style={styles.centered}>
          {isLoading ? <ActivityIndicator color={ACCENT} size="large" /> : null}
          {error ? <Text style={styles.errorText}>Failed to start database: {String(error)}</Text> : null}
        </View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.screenButtonRow}>
            <Pressable style={[styles.button, styles.buttonPrimary, busy && styles.buttonDisabled]} disabled={busy} onPress={syncAll}>
              <Text style={styles.buttonPrimaryText}>Sync All</Text>
            </Pressable>
          </View>

          {busy ? <ActivityIndicator color={ACCENT} style={styles.busySpinner} /> : null}
          {lastResult ? (
            <Text style={[styles.resultText, styles.screenResultText, lastResult.startsWith('Error') && styles.errorText]}>
              {lastResult}
            </Text>
          ) : null}

          <ScrollView contentContainerStyle={styles.listContent} keyboardShouldPersistTaps="handled">
            <EntityPanel
              schema={UserSchema}
              title="Users"
              basePath="/users"
              fields={[
                { key: 'name', label: 'Name' },
                { key: 'email', label: 'Email', keyboardType: 'email-address' },
              ]}
              renderItemLabel={(item) => `${item.name} <${item.email}>`}
              renderItemMeta={(item) => `#${item.id} · updated ${formatTimestamp(item.updatedAt as number)}`}
              sampleServerPayload={() => ({
                name: `Server User ${new Date().toLocaleTimeString()}`,
                email: `server-${Date.now()}@example.com`,
              })}
            />

            <EntityPanel
              schema={ProductSchema}
              title="Products"
              basePath="/products"
              fields={[
                { key: 'name', label: 'Name' },
                { key: 'price', label: 'Price', keyboardType: 'decimal-pad', parse: (raw) => Number(raw) || 0 },
              ]}
              renderItemLabel={(item) => `${item.name} — $${Number(item.price).toFixed(2)}`}
              renderItemMeta={(item) => `#${item.id} · updated ${formatTimestamp(item.updatedAt as number)}`}
              sampleServerPayload={() => ({
                name: `Server Product ${new Date().toLocaleTimeString()}`,
                price: Math.round(Math.random() * 10000) / 100,
              })}
            />
          </ScrollView>

          <Text style={styles.hint}>
            "Write directly on server" POSTs straight to salve-db-server, bypassing SQLite — proves the pull path when
            you tap "Sync this entity" afterwards.
          </Text>
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
  screenHeader: {
    paddingHorizontal: 24,
    paddingTop: 12,
    paddingBottom: 16,
  },
  screenTitle: {
    fontSize: 32,
    fontWeight: '800',
    color: '#1C1D3E',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    marginTop: 4,
    fontSize: 14,
    color: '#8A8CA8',
    fontWeight: '500',
  },
  screenButtonRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    marginBottom: 10,
  },
  screenResultText: {
    marginHorizontal: 20,
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
    fontSize: 11,
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
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F4F5FA',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  itemBody: {
    flex: 1,
    marginRight: 8,
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
  itemAction: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  itemActionText: {
    fontSize: 13,
    color: '#8A8CA8',
    fontWeight: '700',
  },
  itemActionTextDanger: {
    fontSize: 12,
    color: DANGER,
    fontWeight: '700',
  },
  composer: {
    marginTop: 12,
    gap: 8,
  },
  editingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editingLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT,
  },
  editingCancel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#8A8CA8',
  },
  input: {
    height: 42,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F4F5FA',
    fontSize: 13,
    color: '#1C1D3E',
  },
  addButton: {
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  addButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
