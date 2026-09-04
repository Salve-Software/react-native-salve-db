import React, { useState } from 'react';
import { Pressable, StatusBar, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SalveDbProvider } from '@salve-software/react-native-salve-db';
import Salvetron from '@salve-software/salvetron-react-native';
import { ExpenseSchema } from './src/schemas/ExpenseSchema';
import { BudgetSchema } from './src/schemas/BudgetSchema';
import { BenchmarkSchema } from './src/schemas/BenchmarkSchema';
import { FeedItemSchema } from './src/schemas/FeedItemSchema';
import { UserSchema } from './src/schemas/UserSchema';
import { ProductSchema } from './src/schemas/ProductSchema';
import { ExpensesScreen } from './src/screens/ExpensesScreen';
import { InfiniteQueryScreen } from './src/screens/InfiniteQueryScreen';
import { BenchmarkScreen } from './src/screens/BenchmarkScreen';
import { SyncTestScreen } from './src/screens/SyncTestScreen';
import { LoginScreen, type LoginTokens } from './src/screens/LoginScreen';
import { SideMenu } from './src/components/SideMenu';
import { IconButton, ToastProvider } from './src/components/ui';
import { colors, spacing } from './src/theme/tokens';
import { WalletIcon, StackIcon, LightningIcon, ArrowsClockwiseIcon, ListIcon } from './src/theme/icons';
import { SYNC_SERVER_BASE_URL } from './src/library/syncServer';

if (__DEV__) {
  Salvetron.connect({ host: 'localhost', port: 8765 });
}

const TABS = [
  { key: 'expenses', label: 'Query', Icon: WalletIcon },
  { key: 'infinite', label: 'Infinite Query', Icon: StackIcon },
  { key: 'benchmark', label: 'Benchmark', Icon: LightningIcon },
  { key: 'sync', label: 'Sync Test', Icon: ArrowsClockwiseIcon },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const SCHEMAS = [ExpenseSchema, BudgetSchema, BenchmarkSchema, FeedItemSchema, UserSchema, ProductSchema];

/** Shared by the initial SalveDbProvider mount and SideMenu's "reconfigure" button — same db name both times, so the connection (and its subscriptions) survives a reset(). */
function buildDbConfig(tokens: LoginTokens) {
  return {
    name: 'salve-db-example',
    baseUrl: SYNC_SERVER_BASE_URL,
    network: { timeout: 5000 },
    credentials: {
      provider: 'oauth2' as const,
      tokens,
      refresh: {
        endpoint: '/auth/refresh',
        response: { accessToken: '$.accessToken', refreshToken: '$.refreshToken' },
      },
    },
    background: { minimumInterval: 15 * 60 * 1000, requiresNetwork: false },
  };
}

interface AppTabsProps {
  tokens: LoginTokens;
  onLogout: () => void;
}

function AppTabs({ tokens, onLogout }: AppTabsProps): React.JSX.Element {
  const [tab, setTab] = useState<TabKey>('expenses');
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <View style={styles.flex}>
      <SafeAreaView style={styles.header} edges={['top']}>
        <Text style={styles.headerTitle}>Salve DB</Text>
        <IconButton icon={<ListIcon size={18} color={colors.ink} />} onPress={() => setMenuOpen(true)} />
      </SafeAreaView>

      <View style={styles.flex}>
        {tab === 'expenses' ? <ExpensesScreen /> : null}
        {tab === 'infinite' ? <InfiniteQueryScreen /> : null}
        {tab === 'benchmark' ? <BenchmarkScreen /> : null}
        {tab === 'sync' ? <SyncTestScreen accessToken={tokens.accessToken} /> : null}
      </View>

      <SafeAreaView style={styles.tabBar} edges={['bottom']}>
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key;
          return (
            <Pressable key={key} onPress={() => setTab(key)} style={styles.tabItem}>
              {active ? <View style={styles.tabIndicator} /> : null}
              <Icon size={20} weight={active ? 'fill' : 'regular'} color={active ? colors.accent : colors.muted} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]} numberOfLines={1}>
                {label}
              </Text>
            </Pressable>
          );
        })}
      </SafeAreaView>

      <SideMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        schemas={SCHEMAS}
        buildConfig={() => buildDbConfig(tokens)}
        onLogout={onLogout}
      />
    </View>
  );
}

function App(): React.JSX.Element {
  const [tokens, setTokens] = useState<LoginTokens | null>(null);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="light-content" backgroundColor={colors.canvas} />
      <ToastProvider>
        {tokens === null ? (
          <LoginScreen onLoginSuccess={setTokens} />
        ) : (
          <SalveDbProvider config={buildDbConfig(tokens)} schemas={SCHEMAS}>
            <AppTabs tokens={tokens} onLogout={() => setTokens(null)} />
          </SalveDbProvider>
        )}
      </ToastProvider>
    </SafeAreaProvider>
  );
}

export default App;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.ink,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
    gap: spacing.xxs,
  },
  tabIndicator: {
    position: 'absolute',
    top: 0,
    width: 24,
    height: 2,
    borderRadius: 1,
    backgroundColor: colors.accent,
  },
  tabLabel: {
    fontSize: 10,
    fontWeight: '600',
    color: colors.muted,
  },
  tabLabelActive: {
    color: colors.accent,
  },
});
