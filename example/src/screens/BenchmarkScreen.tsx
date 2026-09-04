import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Database, gte, useDatabaseReady } from '@salve-software/react-native-salve-db';
import { BenchmarkSchema } from '../schemas/BenchmarkSchema';
import { Button, Card, Divider, Input, ProgressBar, ScreenHeader, useToast } from '../components/ui';
import { LightningIcon } from '../theme/icons';
import { colors, spacing } from '../theme/tokens';

const DEFAULT_ROWS = 5_000;

interface BenchmarkResult {
  rowCount: number;
  insertMs: number;
  insertedCount: number;
  indexedSelectMs: number;
  indexedSelectRows: number;
  unindexedScanMs: number;
  unindexedScanRows: number;
}

/** Horizontal bar sized relative to the slowest measurement in the pair, so the two are visually comparable at a glance. */
function TimingBar({
  label,
  ms,
  rows,
  tone,
  maxMs,
}: {
  label: string;
  ms: number;
  rows: number;
  tone: 'accent' | 'danger';
  maxMs: number;
}) {
  const progress = maxMs === 0 ? 0.04 : Math.max(0.04, ms / maxMs);
  return (
    <View style={styles.timingRow}>
      <View style={styles.timingHeader}>
        <Text style={styles.timingLabel}>{label}</Text>
        <Text style={styles.timingValue}>
          {ms}ms · {rows} rows
        </Text>
      </View>
      <ProgressBar progress={progress} tone={tone} height={10} />
    </View>
  );
}

export function BenchmarkScreen(): React.JSX.Element {
  const { isReady, isLoading, error } = useDatabaseReady();
  const [rowCountInput, setRowCountInput] = useState(String(DEFAULT_ROWS));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const { showError } = useToast();

  function runBenchmark() {
    const rowCount = Math.max(1, Math.round(Number(rowCountInput)) || DEFAULT_ROWS);
    setRunning(true);
    setRunError(null);
    setResult(null);

    // Deferred so the spinner actually paints before the synchronous JSI calls below block the JS thread.
    setTimeout(() => {
      try {
        Database.delete(BenchmarkSchema).execute();

        const insertStart = Date.now();
        Database.transaction((tx) => {
          for (let i = 0; i < rowCount; i++) {
            tx.insert(BenchmarkSchema).values({ id: i, label: `row_${i}`, createdAt: i }).execute();
          }
        });
        const insertMs = Date.now() - insertStart;

        const indexedStart = Date.now();
        const indexedRows = Database.select(BenchmarkSchema)
          .where(gte('createdAt', Math.max(0, rowCount - 500)))
          .orderBy('createdAt', 'asc')
          .limit(500)
          .execute();
        const indexedSelectMs = Date.now() - indexedStart;

        // `label` has no index — the query builder's execute() would refuse this (see
        // `assertIndexedColumns`), so this goes through the raw SQL escape hatch instead,
        // the one path that can still force a full table scan on purpose.
        const scanStart = Date.now();
        const scanned = Database.execute(
          `SELECT * FROM "${BenchmarkSchema.name}" WHERE "label" LIKE ?`,
          ['row_4%']
        ) as unknown[];
        const unindexedScanMs = Date.now() - scanStart;

        const [{ count }] = Database.execute(`SELECT COUNT(*) as count FROM "${BenchmarkSchema.name}"`) as {
          count: number;
        }[];

        setResult({
          rowCount,
          insertMs,
          insertedCount: count,
          indexedSelectMs,
          indexedSelectRows: indexedRows.length,
          unindexedScanMs,
          unindexedScanRows: scanned.length,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setRunError(message);
        showError(message);
      } finally {
        setRunning(false);
      }
    }, 30);
  }

  const maxCompareMs = result ? Math.max(result.indexedSelectMs, result.unindexedScanMs, 1) : 1;

  return (
    <SafeAreaView style={styles.safeArea} edges={[]}>
      <StatusBar barStyle="light-content" backgroundColor={colors.canvas} />

      <ScreenHeader
        title="Benchmark"
        subtitle={isReady ? 'Real SQLite timings, measured on this device' : 'Starting database…'}
      />

      {!isReady ? (
        <View style={styles.centered}>
          {isLoading ? <ActivityIndicator color={colors.accent} size="large" /> : null}
          {error ? <Text style={styles.errorText}>Failed to start database: {String(error)}</Text> : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <Card>
            <View style={styles.controlsBody}>
              <Input
                label="Rows to insert"
                keyboardType="number-pad"
                value={rowCountInput}
                onChangeText={setRowCountInput}
                editable={!running}
              />
              <Button
                variant="primary"
                onPress={runBenchmark}
                disabled={running}
                loading={running}
                label="Run benchmark"
                icon={running ? undefined : <LightningIcon size={16} color={colors.accentInk} weight="fill" />}
              />
              <Text style={styles.controlsHint}>
                Clears the benchmark table, bulk-inserts inside one transaction, then times an
                indexed `select()` against a raw-SQL unindexed scan.
              </Text>
            </View>
          </Card>

          {result ? (
            <Card>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Bulk insert ({result.rowCount} rows, 1 transaction)</Text>
                <Text style={styles.statValue}>{result.insertMs}ms</Text>
              </View>
              <Text style={styles.statSub}>
                {Math.round(result.insertedCount / (result.insertMs / 1000 || 1)).toLocaleString()} rows/sec
              </Text>

              <Divider />

              <Text style={styles.compareTitle}>Indexed range select vs. unindexed LIKE scan</Text>
              <TimingBar
                label="Indexed select() — createdAt ≥ n-500"
                ms={result.indexedSelectMs}
                rows={result.indexedSelectRows}
                tone="accent"
                maxMs={maxCompareMs}
              />
              <TimingBar
                label="Raw SQL — LIKE on unindexed column"
                ms={result.unindexedScanMs}
                rows={result.unindexedScanRows}
                tone="danger"
                maxMs={maxCompareMs}
              />
            </Card>
          ) : null}
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
    paddingHorizontal: 32,
    gap: 12,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.lg,
  },
  controlsBody: {
    gap: spacing.md,
  },
  controlsHint: {
    fontSize: 12,
    color: colors.muted,
    lineHeight: 17,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.ink,
    flexShrink: 1,
    marginRight: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.accent,
  },
  statSub: {
    fontSize: 12,
    color: colors.muted,
  },
  compareTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: colors.muted,
    marginBottom: spacing.sm,
  },
  timingRow: {
    marginBottom: 14,
    gap: 6,
  },
  timingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  timingLabel: {
    fontSize: 13,
    color: colors.ink,
    fontWeight: '500',
    flexShrink: 1,
    marginRight: 8,
  },
  timingValue: {
    fontSize: 13,
    color: colors.muted,
    fontWeight: '600',
  },
  errorText: {
    marginHorizontal: 20,
    marginBottom: 8,
    fontSize: 13,
    color: colors.danger,
    fontWeight: '500',
    textAlign: 'center',
  },
});
