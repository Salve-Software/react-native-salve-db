import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  message?: string;
}

/** Studio's dashed-border empty-table recipe. */
export function EmptyState({ icon, title, message }: EmptyStateProps): React.JSX.Element {
  return (
    <View style={styles.wrapper}>
      {icon}
      <Text style={styles.title}>{title}</Text>
      {message ? <Text style={styles.message}>{message}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.line,
  },
  title: { fontSize: 14, fontWeight: '600', color: colors.ink },
  message: { fontSize: 12, color: colors.muted, textAlign: 'center', maxWidth: 240 },
});
