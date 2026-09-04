import React, { useState } from 'react';
import { TextInput, View, Text, StyleSheet, type TextInputProps } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

interface InputProps extends TextInputProps {
  label?: string;
}

/**
 * One text-input pattern for the whole app — Studio's
 * `bg-surface-2 border border-line focus:border-accent` recipe — replacing
 * the 4 divergent input styles (pill, outlined, two different filled tones)
 * found across screens before this redesign.
 */
export function Input({ label, style, onFocus, onBlur, ...rest }: InputProps): React.JSX.Element {
  const [focused, setFocused] = useState(false);

  return (
    <View style={styles.wrapper}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <TextInput
        {...rest}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        placeholderTextColor={colors.muted}
        style={[styles.input, focused && styles.inputFocused, style]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: spacing.xs },
  label: { fontSize: 12, fontWeight: '600', color: colors.muted },
  input: {
    height: 44,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    paddingHorizontal: spacing.md,
    fontSize: 14,
    color: colors.ink,
  },
  inputFocused: { borderColor: colors.accent },
});
