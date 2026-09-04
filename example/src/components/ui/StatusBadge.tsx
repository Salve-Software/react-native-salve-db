import React, { useEffect, useRef } from 'react';
import { Animated, View, Text, StyleSheet } from 'react-native';
import { colors, alpha, radius, motion } from '../../theme/tokens';

export type StatusKind = 'ok' | 'pending' | 'danger' | 'muted';

interface StatusBadgeProps {
  label: string;
  status: StatusKind;
  /** Animated pulse on the dot — Studio uses this for "live"/connecting states. */
  pulse?: boolean;
}

const kindStyle: Record<StatusKind, { bg: string; border: string; text: string; dot: string }> = {
  ok: { bg: alpha.ok10, border: alpha.ok25, text: colors.ok, dot: colors.ok },
  pending: { bg: alpha.pending10, border: alpha.pending30, text: colors.brandYellow, dot: colors.brandYellow },
  danger: { bg: alpha.danger10, border: alpha.danger30, text: colors.danger, dot: colors.danger },
  muted: { bg: 'transparent', border: colors.line, text: colors.muted, dot: colors.muted },
};

/**
 * Pill + dot — the Studio's StatusBadge recipe (connected/disconnected),
 * reused here as the canonical way to surface sync_queue/metadata states
 * instead of raw "PENDING 3 · FAILED 1" strings.
 */
export function StatusBadge({ label, status, pulse }: StatusBadgeProps): React.JSX.Element {
  const opacity = useRef(new Animated.Value(1)).current;
  const tone = kindStyle[status];

  useEffect(() => {
    if (!pulse) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 0.35, duration: motion.pulse / 2, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: motion.pulse / 2, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse, opacity]);

  return (
    <View style={[styles.badge, { backgroundColor: tone.bg, borderColor: tone.border }]}>
      <Animated.View style={[styles.dot, { backgroundColor: tone.dot, opacity: pulse ? opacity : 1 }]} />
      <Text style={[styles.label, { color: tone.text }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  label: { fontSize: 11, fontWeight: '600' },
});
