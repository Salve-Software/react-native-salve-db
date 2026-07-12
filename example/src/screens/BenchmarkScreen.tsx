import React, { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Database, gte, useDatabaseReady } from '@salve-software/react-native-salve-db';
import { BenchmarkSchema } from '../schemas/BenchmarkSchema';

const ACCENT = '#5B5FEF';
const GOOD = '#22B07D';
const BAD = '#E14F62';
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
function TimingBar({ label, ms, rows, color, maxMs }: { label: string; ms: number; rows: number; color: string; maxMs: number }) {
  const widthPct = maxMs === 0 ? 4 : Math.max(4, Math.round((ms / maxMs) * 100));
  return (
    <View style={styles.timingRow}>
      <View style={styles.timingHeader}>
        <Text style={styles.timingLabel}>{label}</Text>
        <Text style={styles.timingValue}>{ms}ms · {rows} rows</Text>
      </View>
      <View style={styles.timingTrack}>
        <View style={[styles.timingFill, { width: `${widthPct}%`, backgroundColor: color }]} />
      </View>
    </View>
  );
}

export function BenchmarkScreen(): React.JSX.Element {
  const { isReady, isLoading, error } = useDatabaseReady();
  const [rowCountInput, setRowCountInput] = useState(String(DEFAULT_ROWS));
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<BenchmarkResult | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

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
        setRunError(err instanceof Error ? err.message : String(err));
      } finally {
        setRunning(false);
      }
    }, 30);
  }

  const maxCompareMs = result ? Math.max(result.indexedSelectMs, result.unindexedScanMs, 1) : 1;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5FA" />

      <View style={styles.header}>
        <Text style={styles.title}>Benchmark</Text>
        <Text style={styles.subtitle}>
          {isReady ? 'Real SQLite timings, measured on this device' : 'Starting database…'}
        </Text>
      </View>

      {!isReady ? (
        <View style={styles.centered}>
          {isLoading ? <ActivityIndicator color={ACCENT} size="large" /> : null}
          {error ? <Text style={styles.errorText}>Failed to start database: {String(error)}</Text> : null}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.controlsCard}>
            <Text style={styles.controlsLabel}>Rows to insert</Text>
            <View style={styles.controlsRow}>
              <TextInput
                style={styles.rowCountInput}
                keyboardType="number-pad"
                value={rowCountInput}
                onChangeText={setRowCountInput}
                editable={!running}
              />
              <Pressable
                onPress={runBenchmark}
                disabled={running}
                style={({ pressed }) => [styles.runButton, running && styles.runButtonDisabled, pressed && !running ? styles.runButtonPressed : null]}
              >
                {running ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.runButtonText}>Run benchmark</Text>
                )}
              </Pressable>
            </View>
            <Text style={styles.controlsHint}>
              Clears the benchmark table, bulk-inserts inside one transaction, then times an
              indexed `select()` against a raw-SQL unindexed scan.
            </Text>
          </View>

          {runError ? <Text style={styles.errorText}>{runError}</Text> : null}

          {result ? (
            <View style={styles.resultsCard}>
              <View style={styles.statRow}>
                <Text style={styles.statLabel}>Bulk insert ({result.rowCount} rows, 1 transaction)</Text>
                <Text style={styles.statValue}>{result.insertMs}ms</Text>
              </View>
              <Text style={styles.statSub}>
                {Math.round(result.insertedCount / (result.insertMs / 1000 || 1)).toLocaleString()} rows/sec
              </Text>

              <View style={styles.divider} />

              <Text style={styles.compareTitle}>Indexed range select vs. unindexed LIKE scan</Text>
              <TimingBar
                label="Indexed select() — createdAt ≥ n-500"
                ms={result.indexedSelectMs}
                rows={result.indexedSelectRows}
                color={GOOD}
                maxMs={maxCompareMs}
              />
              <TimingBar
                label="Raw SQL — LIKE on unindexed column"
                ms={result.unindexedScanMs}
                rows={result.unindexedScanRows}
                color={BAD}
                maxMs={maxCompareMs}
              />
            </View>
          ) : null}
        </ScrollView>
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
    paddingBottom: 20,
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
  content: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 16,
  },
  controlsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    gap: 10,
    shadowColor: '#2B2D6B',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  controlsLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A8CA8',
  },
  controlsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  rowCountInput: {
    width: 110,
    height: 44,
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#F4F5FA',
    fontSize: 16,
    color: '#1C1D3E',
  },
  runButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
  },
  runButtonPressed: {
    opacity: 0.85,
  },
  runButtonDisabled: {
    backgroundColor: '#9C9EE8',
  },
  runButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  controlsHint: {
    fontSize: 12,
    color: '#B4B6D0',
    lineHeight: 17,
  },
  resultsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    gap: 6,
    shadowColor: '#2B2D6B',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1D3E',
    flexShrink: 1,
    marginRight: 8,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '800',
    color: ACCENT,
  },
  statSub: {
    fontSize: 12,
    color: '#8A8CA8',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: '#E1E2F0',
    marginVertical: 10,
  },
  compareTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8A8CA8',
    marginBottom: 8,
  },
  timingRow: {
    marginBottom: 14,
  },
  timingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  timingLabel: {
    fontSize: 13,
    color: '#1C1D3E',
    fontWeight: '500',
    flexShrink: 1,
    marginRight: 8,
  },
  timingValue: {
    fontSize: 13,
    color: '#8A8CA8',
    fontWeight: '600',
  },
  timingTrack: {
    height: 10,
    borderRadius: 5,
    backgroundColor: '#F4F5FA',
    overflow: 'hidden',
  },
  timingFill: {
    height: '100%',
    borderRadius: 5,
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
