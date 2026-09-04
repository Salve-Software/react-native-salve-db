import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing } from '../../theme/tokens';

export interface ToastContextValue {
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const AUTO_DISMISS_MS = 4000;

/**
 * Global error banner — Studio's bottom toast recipe (danger dot + card,
 * auto-dismiss). Mounted once at the app root via <ToastProvider>; screens
 * call useToast().showError(message) instead of rendering their own inline
 * error <Text>, so a failure surfaces the same way everywhere.
 */
export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [message, setMessage] = useState<string | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const dismissTimer = useRef<number | null>(null);

  const showError = useCallback(
    (text: string) => {
      clearTimeout(dismissTimer.current ?? undefined);
      setMessage(text);
      Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }).start();
      dismissTimer.current = setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }).start(() => setMessage(null));
      }, AUTO_DISMISS_MS) as unknown as number;
    },
    [opacity],
  );

  return (
    <ToastContext.Provider value={{ showError }}>
      {children}
      {message ? (
        <Animated.View pointerEvents="none" style={[styles.toast, { opacity }]}>
          <View style={styles.dot} />
          <Text style={styles.text} numberOfLines={2}>
            {message}
          </Text>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast() must be called within <ToastProvider>');
  return ctx;
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    bottom: spacing.xl,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(251, 113, 117, 0.3)',
    backgroundColor: colors.surface,
    padding: spacing.md,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.danger, marginTop: 5 },
  text: { flex: 1, fontSize: 13, color: colors.ink },
});
