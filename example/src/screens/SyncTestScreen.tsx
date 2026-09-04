import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
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
import { Button, Card, IconButton, Input, ScreenHeader, StatusBadge, useToast, type StatusKind } from '../components/ui';
import { CaretDownIcon, PencilSimpleIcon, TrashIcon } from '../theme/icons';
import { colors, spacing } from '../theme/tokens';

interface StatusCounts {
  [status: string]: number;
}

/** Maps a raw sync_queue/_salve_sync_metadata status string onto the shared <StatusBadge> vocabulary. */
function statusToBadgeKind(status: string): StatusKind {
  switch (status) {
    case 'PENDING':
      return 'pending';
    case 'FAILED':
    case 'BLOCKED':
      return 'danger';
    case 'SYNCED':
      return 'ok';
    case 'DELETED':
      return 'muted';
    default:
      return 'muted';
  }
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
  accessToken: string;
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
function EntityPanel({ schema, title, basePath, fields, renderItemLabel, renderItemMeta, sampleServerPayload, accessToken }: EntityPanelProps): React.JSX.Element {
  const { data: items, error: itemsError } = useQuery({
    schema,
    queryFn: (q) => q.orderBy('updatedAt', 'desc').limit(50),
  });

  const [values, setValues] = useState<Record<string, string>>(emptyValues(fields));
  const [editingId, setEditingId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const toast = useToast();

  const { queue: queueCounts, metadata: metadataCounts } = useSyncStateCounts(schema.name, items);

  useEffect(() => {
    if (itemsError) toast.showError(`Query failed: ${String(itemsError)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemsError]);

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
      toast.showError(err instanceof Error ? err.message : String(err));
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
        headers: { 'Content-Type': 'application/json', Authorization: accessToken },
        body: JSON.stringify(sampleServerPayload()),
      });
      if (!response.ok) throw new Error(`${basePath} responded ${response.status}`);
      setLastResult('Wrote directly to the server — tap "Sync this entity" to pull it down.');
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const canSubmit = fields.every((field) => (values[field.key] ?? '').trim().length > 0);

  return (
    <Card style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <Button
          variant="text"
          size="sm"
          label={showDetails ? 'Hide technical details' : 'Technical details'}
          icon={<CaretDownIcon size={14} color={colors.muted} />}
          onPress={() => setShowDetails((prev) => !prev)}
          style={styles.detailsToggle}
        />
        {showDetails ? (
          <View style={styles.detailsBlock}>
            <View style={styles.detailsRow}>
              <Text style={styles.detailsLabel}>queue</Text>
              {Object.entries(queueCounts).map(([status, count]) => (
                <StatusBadge key={`q-${status}`} label={`${status} ${count}`} status={statusToBadgeKind(status)} />
              ))}
            </View>
            <View style={styles.detailsRow}>
              <Text style={styles.detailsLabel}>state</Text>
              {Object.entries(metadataCounts).map(([status, count]) => (
                <StatusBadge key={`m-${status}`} label={`${status} ${count}`} status={statusToBadgeKind(status)} />
              ))}
            </View>
          </View>
        ) : null}
      </View>

      <View style={styles.buttonRow}>
        <Button
          variant="ghost"
          size="sm"
          label="Write directly on server"
          disabled={busy}
          onPress={writeDirectlyOnServer}
          style={styles.ghostAction}
        />
        <Button variant="primary" label="Sync this entity" disabled={busy} onPress={runSync} style={styles.primaryAction} />
      </View>

      {busy ? <ActivityIndicator color={colors.accent} style={styles.busySpinner} /> : null}
      {lastResult ? <Text style={styles.resultText}>{lastResult}</Text> : null}

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
              <IconButton icon={<PencilSimpleIcon size={16} color={colors.muted} />} onPress={() => startEdit(item)} />
              <IconButton icon={<TrashIcon size={16} color={colors.danger} />} onPress={() => removeItem(id)} variant="danger" />
            </View>
          );
        })
      )}

      <View style={styles.composer}>
        {editingId !== null ? (
          <View style={styles.editingRow}>
            <Text style={styles.editingLabel}>Editing #{editingId}</Text>
            <Button variant="text" size="sm" label="Cancel" onPress={cancelEdit} />
          </View>
        ) : null}

        {fields.map((field) => (
          <Input
            key={field.key}
            placeholder={field.label}
            keyboardType={field.keyboardType}
            value={values[field.key] ?? ''}
            onChangeText={(text) => setValues((prev) => ({ ...prev, [field.key]: text }))}
          />
        ))}

        <Button
          label={editingId === null ? 'Add local item' : 'Save changes'}
          onPress={submit}
          disabled={!canSubmit}
        />
      </View>
    </Card>
  );
}

interface SyncTestScreenProps {
  accessToken: string;
}

async function fetchRefreshCount(): Promise<number | null> {
  try {
    const response = await fetch(`${SYNC_SERVER_BASE_URL}/auth/_debug/refreshCount`);
    if (!response.ok) return null;
    const body = (await response.json()) as { refreshCount: number };
    return body.refreshCount;
  } catch {
    return null;
  }
}

/** Manual test surface for the sync engine against packages/salve-db-server's real REST API — Users and Products, each with independently-shaped listQueryTemplate. */
export function SyncTestScreen({ accessToken }: SyncTestScreenProps): React.JSX.Element {
  const { isReady, isLoading, error } = useDatabaseReady();
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [refreshCount, setRefreshCount] = useState<number | null>(null);
  const toast = useToast();

  useEffect(() => {
    if (error) toast.showError(`Failed to start database: ${String(error)}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [error]);

  async function syncAll() {
    setBusy(true);
    setLastResult(null);
    try {
      const before = await fetchRefreshCount();
      const results = await Database.syncAll();
      const after = await fetchRefreshCount();
      setRefreshCount(after);
      const delta = before !== null && after !== null ? after - before : null;
      setLastResult(
        `syncAll() ok — ${results.length} schema(s) synced` +
          (delta !== null ? ` — native refresh fired ${delta}x during this sync` : '')
      );
    } catch (err) {
      toast.showError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.canvas} />

      <ScreenHeader
        title="Sync Test"
        subtitle={isReady ? 'Users + Products against salve-db-server' : 'Starting database…'}
      />
      {refreshCount !== null ? (
        <Text style={styles.refreshCountText}>server-side native refresh count: {refreshCount}</Text>
      ) : null}

      {!isReady ? (
        <View style={styles.centered}>{isLoading ? <ActivityIndicator color={colors.accent} size="large" /> : null}</View>
      ) : (
        <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.screenButtonRow}>
            <Button label="Sync All" disabled={busy} onPress={syncAll} />
          </View>

          {busy ? <ActivityIndicator color={colors.accent} style={styles.busySpinner} /> : null}
          {lastResult ? <Text style={[styles.resultText, styles.screenResultText]}>{lastResult}</Text> : null}

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
              accessToken={accessToken}
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
              accessToken={accessToken}
            />
          </ScrollView>
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
    paddingHorizontal: 32,
    gap: 12,
  },
  refreshCountText: {
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  screenButtonRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: spacing.lg,
    marginBottom: 10,
  },
  screenResultText: {
    marginHorizontal: spacing.lg,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 12,
    flexGrow: 1,
  },

  card: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.lg,
  },
  header: {
    marginBottom: spacing.sm,
    gap: spacing.xs,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.ink,
  },
  detailsToggle: {
    alignSelf: 'flex-start',
  },
  detailsBlock: {
    gap: spacing.xs,
    marginTop: spacing.xxs,
  },
  detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.xs,
  },
  detailsLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.muted,
    textTransform: 'uppercase',
    marginRight: spacing.xxs,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  ghostAction: {
    flex: 1,
  },
  primaryAction: {
    flex: 1,
  },
  busySpinner: {
    marginTop: 4,
  },
  resultText: {
    marginTop: spacing.sm,
    fontSize: 12,
    color: colors.muted,
    fontWeight: '500',
  },
  emptyText: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '500',
    textAlign: 'center',
    marginTop: spacing.md,
  },
  itemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface2,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: spacing.sm,
    gap: spacing.xs,
  },
  itemBody: {
    flex: 1,
    marginRight: spacing.xs,
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.ink,
  },
  itemMeta: {
    marginTop: 2,
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  composer: {
    marginTop: spacing.md,
    gap: spacing.sm,
  },
  editingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  editingLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: colors.accent,
  },
});
