import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, spacing } from '../../theme/tokens';

interface ScreenHeaderProps {
  title: string;
  subtitle?: string;
}

/**
 * One title/subtitle recipe for every screen — replaces the 3 divergent
 * title sizes (32/24/22) found across the app before this redesign.
 */
export function ScreenHeader({ title, subtitle }: ScreenHeaderProps): React.JSX.Element {
  return (
    <View style={styles.wrapper}>
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm, gap: spacing.xxs },
  title: { fontSize: 24, fontWeight: '800', color: colors.ink, letterSpacing: -0.3 },
  subtitle: { fontSize: 13, fontWeight: '500', color: colors.muted },
});
