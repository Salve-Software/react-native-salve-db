import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Dimensions, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import type { AnySchema } from '@salve-software/react-native-salve-db';
import { Database } from '@salve-software/react-native-salve-db';
import { Button, IconButton, Divider } from './ui';
import { XIcon, SignOutIcon, DatabaseIcon } from '../theme/icons';
import { colors, spacing, typography } from '../theme/tokens';

const PANEL_WIDTH = Math.min(300, Dimensions.get('window').width * 0.82);

type ConfigureProps = Parameters<typeof Database.configure>[0];

interface SideMenuProps {
  visible: boolean;
  onClose: () => void;
  schemas: AnySchema[];
  buildConfig: () => ConfigureProps;
  /** Called after a successful `Database.logout()`, so the caller can drop its held tokens and show the login screen again. */
  onLogout: () => void;
}

/**
 * Replaces the always-visible ResetControls bar: the same reset/reconfigure/
 * logout QA actions, now tucked behind a hamburger trigger in a slide-in
 * panel instead of permanently occupying screen space above every tab.
 */
export function SideMenu({ visible, onClose, schemas, buildConfig, onLogout }: SideMenuProps): React.JSX.Element {
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);
  const translateX = useRef(new Animated.Value(PANEL_WIDTH)).current;

  useEffect(() => {
    Animated.timing(translateX, {
      toValue: visible ? 0 : PANEL_WIDTH,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, translateX]);

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

  async function logout() {
    setBusy(true);
    setLastResult(null);
    try {
      Database.logout();
      onClose();
      onLogout();
    } catch (err) {
      setLastResult(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <SafeAreaProvider>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.panel, { width: PANEL_WIDTH, transform: [{ translateX }] }]}>
        <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Menu</Text>
            <IconButton icon={<XIcon size={16} color={colors.muted} />} onPress={onClose} />
          </View>

          <View style={styles.info}>
            <DatabaseIcon size={14} color={colors.muted} />
            <Text style={styles.infoText}>{buildConfig().name}</Text>
          </View>

          <Divider />

          <View style={styles.section}>
            <Button label="Reset (local)" variant="ghost" disabled={busy} onPress={resetLocal} />
            <Button label="Reset + Reconfigure" variant="dangerOutline" disabled={busy} onPress={resetAndReconfigure} />
          </View>

          <Divider />

          <View style={styles.section}>
            <Button
              label="Logout"
              variant="dangerSolid"
              disabled={busy}
              onPress={logout}
              icon={<SignOutIcon size={16} color={colors.canvas} />}
            />
          </View>

          {busy ? <ActivityIndicator color={colors.muted} style={styles.spinner} /> : null}
          {lastResult ? (
            <Text style={[styles.resultText, lastResult.startsWith('Error') && styles.errorText]} numberOfLines={3}>
              {lastResult}
            </Text>
          ) : null}
        </SafeAreaView>
      </Animated.View>
      </SafeAreaProvider>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  panel: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderLeftWidth: 1,
    borderLeftColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: { ...typography.sectionTitle, color: colors.ink },
  info: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  infoText: { fontSize: 12, color: colors.muted, fontFamily: 'Menlo' },
  section: { gap: spacing.sm },
  spinner: { marginTop: spacing.xs },
  resultText: {
    marginTop: spacing.xs,
    fontSize: 11,
    color: colors.muted,
    fontWeight: '500',
  },
  errorText: { color: colors.danger },
});
