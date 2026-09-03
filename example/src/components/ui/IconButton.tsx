import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

interface IconButtonProps {
  icon: React.ReactNode;
  onPress: () => void;
  disabled?: boolean;
  variant?: 'ghost' | 'danger';
  testID?: string;
}

/** Icon-only control — Studio's `rounded-md border border-line p-1.5` pattern. */
export function IconButton({ icon, onPress, disabled, variant = 'ghost', testID }: IconButtonProps): React.JSX.Element {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      testID={testID}
      style={({ pressed }) => [
        styles.base,
        variant === 'danger' && styles.danger,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xs,
  },
  danger: { borderColor: colors.danger },
  pressed: { borderColor: colors.lineStrong, backgroundColor: 'rgba(255,255,255,0.05)' },
  disabled: { opacity: 0.4 },
});
