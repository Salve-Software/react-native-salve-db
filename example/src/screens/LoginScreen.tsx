import React, { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SYNC_SERVER_BASE_URL } from '../library/syncServer';

const ACCENT = '#5B5FEF';
const DANGER = '#E14F62';

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
      <StatusBar barStyle="dark-content" backgroundColor="#F4F5FA" />
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.card}>
          <Text style={styles.title}>Salve DB Example</Text>
          <Text style={styles.subtitle}>
            Sign in against salve-db-server's mock oauth2 user to exercise the native
            refresh-on-401 flow.
          </Text>

          <TextInput
            style={styles.input}
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="Email"
            placeholderTextColor="#9B9DB8"
          />
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            placeholder="Password"
            placeholderTextColor="#9B9DB8"
          />

          <Pressable
            style={[styles.button, busy && styles.buttonDisabled]}
            disabled={busy}
            onPress={submit}
          >
            <Text style={styles.buttonText}>{busy ? 'Signing in…' : 'Sign in'}</Text>
          </Pressable>

          {busy ? <ActivityIndicator color={ACCENT} style={styles.spinner} /> : null}
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#F4F5FA' },
  flex: { flex: 1, justifyContent: 'center' },
  card: {
    marginHorizontal: 24,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    gap: 12,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#1C1D3E',
  },
  subtitle: {
    fontSize: 13,
    color: '#8A8CA8',
    fontWeight: '500',
    marginBottom: 4,
  },
  input: {
    height: 44,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F4F5FA',
    fontSize: 14,
    color: '#1C1D3E',
  },
  button: {
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: ACCENT,
    marginTop: 4,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  spinner: {
    marginTop: 4,
  },
  errorText: {
    fontSize: 12,
    color: DANGER,
    fontWeight: '500',
  },
});
