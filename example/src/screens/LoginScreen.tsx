import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, StatusBar, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, Input } from '../components/ui';
import { colors, spacing, typography } from '../theme/tokens';
import { SYNC_SERVER_BASE_URL } from '../library/syncServer';

export interface LoginTokens {
  accessToken: string;
  refreshToken: string;
}

interface LoginScreenProps {
  onLoginSuccess: (tokens: LoginTokens) => void;
}

/**
 * Manual QA entry point for the mock oauth2 flow: email/password come
 * pre-filled with the demo user salve-db-server's `/auth/login` accepts, so
 * exercising the native refresh-on-401 path is a single tap away. Requires
 * the server started with `REQUIRE_AUTH=true` — see server/.env.example.
 */
export function LoginScreen({ onLoginSuccess }: LoginScreenProps): React.JSX.Element {
  const [email, setEmail] = useState('demo@salve.dev');
  const [password, setPassword] = useState('salve-demo-2026');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`${SYNC_SERVER_BASE_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      if (!response.ok) throw new Error(`/auth/login responded ${response.status}`);
      const body = (await response.json()) as LoginTokens;
      onLoginSuccess({ accessToken: body.accessToken, refreshToken: body.refreshToken });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" backgroundColor={colors.canvas} />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <Card style={styles.card}>
          <Text style={styles.title}>Salve DB Example</Text>
          <Text style={styles.subtitle}>
            Sign in against salve-db-server's mock oauth2 user to exercise the native
            refresh-on-401 flow.
          </Text>

          <Input
            label="Email"
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
          />
          <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry />

          <Button
            variant="primary"
            loading={busy}
            disabled={busy}
            label={busy ? 'Signing in…' : 'Sign in'}
            onPress={submit}
            style={styles.button}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </Card>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.canvas },
  flex: { flex: 1, justifyContent: 'center' },
  card: {
    marginHorizontal: spacing.xl,
    gap: spacing.md,
  },
  title: {
    ...typography.title,
    color: colors.ink,
  },
  subtitle: {
    ...typography.body,
    color: colors.muted,
    marginBottom: spacing.xs,
  },
  button: {
    marginTop: spacing.xs,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
});
