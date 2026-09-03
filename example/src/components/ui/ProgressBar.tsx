import React from 'react';
import { View, StyleSheet } from 'react-native';
import { colors, radius } from '../../theme/tokens';

interface ProgressBarProps {
  /** 0–1. Values are clamped. */
  progress: number;
  tone?: 'accent' | 'danger' | 'ok';
  height?: number;
}

const toneColor = { accent: colors.accent, danger: colors.danger, ok: colors.ok };

/**
 * One track/fill bar, reused by both the Query budget indicator and the
 * Benchmark comparison bars — previously two separate implementations.
 */
export function ProgressBar({ progress, tone = 'accent', height = 8 }: ProgressBarProps): React.JSX.Element {
  const pct = Math.max(0, Math.min(1, progress)) * 100;
  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: toneColor[tone], borderRadius: height / 2 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { backgroundColor: colors.surface2, overflow: 'hidden', borderRadius: radius.sm },
  fill: { height: '100%' },
});
