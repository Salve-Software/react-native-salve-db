import React, { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { AnySchema } from '@salve-software/react-native-salve-db';
import { Database } from '@salve-software/react-native-salve-db';

const ACCENT = '#5B5FEF';
const DANGER = '#E14F62';

type ConfigureProps = Parameters<typeof Database.configure>[0];

interface ResetControlsProps {
  schemas: AnySchema[];
  buildConfig: () => ConfigureProps;
}

/**
 * Manual QA surface for Database.reset(): "Reset (local)" proves the wipe +
 * reactivity without touching sync; "Reset + Reconfigure" additionally calls
 * configure() again with the same db name, proving the connection (and every
 * useQuery subscription mounted anywhere in the tab tree) survives instead of
 * silently going stale.
 */
export function ResetControls({ schemas, buildConfig }: ResetControlsProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  async function registerAllSchemas() {
    for (const schema of schemas) {
      await Database.register({ schema });
    }
  }

  async function resetLocal() {
    setBusy(true);
    setLastResult(null);
    try {
      await Database.reset();
      await registerAllSchemas();
      setLastResult('Reset (local) ok — data wiped, sync needs configure() again to resume.');
    } catch (err) {
      setLastResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  async function resetAndReconfigure() {
    setBusy(true);
    setLastResult(null);
    try {
      await Database.reset();
      Database.configure(buildConfig());
      await registerAllSchemas();
      setLastResult('Reset + Reconfigure ok — same db name, sync restored, no remount.');
    } catch (err) {
      setLastResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.buttonRow}>
        <Pressable style={[styles.button, busy && styles.buttonDisabled]} disabled={busy} onPress={resetLocal}>
          <Text style={styles.buttonText}>Reset (local)</Text>
        </Pressable>
        <Pressable style={[styles.button, styles.buttonDanger, busy && styles.buttonDisabled]} disabled={busy} onPress={resetAndReconfigure}>
          <Text style={styles.buttonDangerText}>Reset + Reconfigure</Text>
        </Pressable>
      </View>
      {busy ? <ActivityIndicator color={ACCENT} style={styles.spinner} /> : null}
      {lastResult ? (
        <Text style={[styles.resultText, lastResult.startsWith('Error') && styles.errorText]} numberOfLines={2}>
          {lastResult}
        </Text>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E1E2F0',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  button: {
    flex: 1,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F5FA',
  },
  buttonDanger: {
    backgroundColor: DANGER,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1C1D3E',
  },
  buttonDangerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  spinner: {
    marginTop: 6,
  },
  resultText: {
    marginTop: 6,
    fontSize: 11,
    color: '#4A4D7A',
    fontWeight: '500',
  },
  errorText: {
    color: DANGER,
  },
});
