import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { SalveDbProvider } from '@salve-software/react-native-salve-db';
import Salvetron from '@salve-software/salvetron-react-native';
import { ExpenseSchema } from './src/schemas/ExpenseSchema';
import { BudgetSchema } from './src/schemas/BudgetSchema';
import { BenchmarkSchema } from './src/schemas/BenchmarkSchema';
import { SyncTestItemSchema } from './src/schemas/SyncTestItemSchema';
import { ExpensesScreen } from './src/screens/ExpensesScreen';
import { BenchmarkScreen } from './src/screens/BenchmarkScreen';
import { SyncTestScreen } from './src/screens/SyncTestScreen';

if (__DEV__) {
  Salvetron.connect({ host: 'localhost', port: 8765 });
}

// TEMPORARY — manual sync testing only. Point this at your machine's LAN IP
// (see mock-sync-server.js) so a simulator/emulator AND a real device on the
// same Wi-Fi can both reach it. `localhost`/`10.0.2.2` only work from one or
// the other, not a real device.
const MOCK_SYNC_SERVER_BASE_URL = 'http://192.168.0.2:4000';

const ACCENT = '#5B5FEF';

const TABS = [
  { key: 'expenses', label: 'Expenses', icon: '💸' },
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
        }}
        schemas={[ExpenseSchema, BudgetSchema, BenchmarkSchema, SyncTestItemSchema]}
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
