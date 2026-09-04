import React, { useRef } from 'react';
import { Animated, Pressable, StyleSheet, Text, ActivityIndicator, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius, spacing, motion } from '../../theme/tokens';

export type ButtonVariant = 'primary' | 'ghost' | 'dangerSolid' | 'dangerOutline' | 'text';
export type ButtonSize = 'sm' | 'md';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/**
 * Shared button — 5 variants matching the Studio's exact button vocabulary
 * (primary green CTA / ghost outline / solid danger / outline danger / text-only),
 * replacing the 5 divergent button heights and 6 border-radii found across
 * the example app's screens before this redesign.
 */
export function Button({ label, onPress, variant = 'primary', size = 'md', disabled, loading, icon, style, testID }: ButtonProps): React.JSX.Element {
  const scale = useRef(new Animated.Value(1)).current;
  const isDisabled = disabled || loading;

  function pressIn() {
    Animated.timing(scale, { toValue: 0.97, duration: motion.fast, useNativeDriver: true }).start();
  }
  function pressOut() {
    Animated.timing(scale, { toValue: 1, duration: motion.fast, useNativeDriver: true }).start();
  }

  const variantStyle = variantStyles[variant];
  const sizeStyle = size === 'sm' ? styles.sizeSm : styles.sizeMd;

  return (
    <Animated.View style={[{ transform: [{ scale }] }, style]}>
      <Pressable
        onPress={onPress}
        onPressIn={pressIn}
        onPressOut={pressOut}
        disabled={isDisabled}
        testID={testID}
        style={[styles.base, sizeStyle, variantStyle.container, isDisabled && styles.disabled]}
      >
        {loading ? (
          <ActivityIndicator size="small" color={variantStyle.text.color} />
        ) : (
          <>
            {icon}
            <Text style={[styles.label, size === 'sm' && styles.labelSm, variantStyle.text]} numberOfLines={1}>{label}</Text>
          </>
        )}
      </Pressable>
    </Animated.View>
  );
}

const variantStyles: Record<ButtonVariant, { container: ViewStyle; text: { color: string } }> = {
  primary: { container: { backgroundColor: colors.accent, borderWidth: 0 }, text: { color: colors.accentInk } },
  ghost: { container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.line }, text: { color: colors.muted } },
  dangerSolid: { container: { backgroundColor: colors.danger, borderWidth: 0 }, text: { color: colors.canvas } },
  dangerOutline: { container: { backgroundColor: 'transparent', borderWidth: 1, borderColor: colors.danger }, text: { color: colors.danger } },
  text: { container: { backgroundColor: 'transparent', borderWidth: 0, paddingHorizontal: 0 }, text: { color: colors.muted } },
};

const styles = StyleSheet.create({
  base: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    borderRadius: radius.sm,
  },
  sizeMd: { height: 44, paddingHorizontal: spacing.lg },
  sizeSm: { height: 34, paddingHorizontal: spacing.md },
  label: { fontSize: 14, fontWeight: '600' },
  labelSm: { fontSize: 12 },
  disabled: { opacity: 0.4 },
});
