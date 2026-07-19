import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SalveDbProvider } from '@salve-software/react-native-salve-db';
// import Salvetron from '@salve-software/salvetron-react-native';
import { ExpenseSchema } from './src/schemas/ExpenseSchema';
import { BudgetSchema } from './src/schemas/BudgetSchema';
import { BenchmarkSchema } from './src/schemas/BenchmarkSchema';
import { FeedItemSchema } from './src/schemas/FeedItemSchema';
import { SyncTestItemSchema } from './src/schemas/SyncTestItemSchema';
import { SyncTestNoteSchema } from './src/schemas/SyncTestNoteSchema';
import { SyncTestTagSchema } from './src/schemas/SyncTestTagSchema';
import { ExpensesScreen } from './src/screens/ExpensesScreen';
import { InfiniteQueryScreen } from './src/screens/InfiniteQueryScreen';
import { BenchmarkScreen } from './src/screens/BenchmarkScreen';
import { SyncTestScreen } from './src/screens/SyncTestScreen';
import { MOCK_SYNC_SERVER_BASE_URL } from './src/library/mockSyncServer';

// if (__DEV__) {
//   Salvetron.connect({ host: 'localhost', port: 8765 });
// }

const ACCENT = '#5B5FEF';

const TABS = [
  { key: 'expenses', label: 'Query', icon: '💸' },
  { key: 'infinite', label: 'Infinite Query', icon: '📜' },
  { key: 'benchmark', label: 'Benchmark', icon: '⚡' },
  { key: 'sync', label: 'Sync Test', icon: '🔄' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

function AppTabs(): React.JSX.Element {
  const [tab, setTab] = useState<TabKey>('expenses');

  return (
    <View style={styles.flex}>
      <View style={styles.flex}>
        {tab === 'expenses' ? <ExpensesScreen /> : null}
        {tab === 'infinite' ? <InfiniteQueryScreen /> : null}
        {tab === 'benchmark' ? <BenchmarkScreen /> : null}
        {tab === 'sync' ? <SyncTestScreen /> : null}
      </View>

      <SafeAreaView style={styles.tabBar} edges={['bottom']}>
        {TABS.map(({ key, label, icon }) => (
          <Pressable key={key} onPress={() => setTab(key)} style={styles.tabItem}>
            <Text style={[styles.tabIcon, tab === key && styles.tabIconActive]}>{icon}</Text>
            <Text style={[styles.tabLabel, tab === key && styles.tabLabelActive]}>{label}</Text>
          </Pressable>
        ))}
      </SafeAreaView>
    </View>
  );
}

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <SalveDbProvider
        config={{
          name: 'salve-db-example',
          baseUrl: MOCK_SYNC_SERVER_BASE_URL,
          network: { timeout: 5000 },
          credentials: {
            provider: 'oauth2',
            tokens: { accessToken: 'mock-access-token', refreshToken: 'mock-refresh-token' },
            refresh: {
              endpoint: '/auth/refresh',
              response: { accessToken: '$.accessToken', refreshToken: '$.refreshToken' },
            },
          },
          background: { minimumInterval: 15 * 60 * 1000, requiresNetwork: false },
        }}
        schemas={[
          ExpenseSchema,
          BudgetSchema,
          BenchmarkSchema,
          FeedItemSchema,
          SyncTestItemSchema,
          SyncTestNoteSchema,
          SyncTestTagSchema,
        ]}
      >
        <AppTabs />
      </SalveDbProvider>
    </SafeAreaProvider>
  );
}

export default App;

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E1E2F0',
  },
  tabItem: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
    gap: 2,
  },
  tabIcon: {
    fontSize: 20,
    opacity: 0.5,
  },
  tabIconActive: {
    opacity: 1,
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9B9DB8',
  },
  tabLabelActive: {
    color: ACCENT,
  },
});
