import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { SalveDbProvider } from '@salve-software/react-native-salve-db';
import Salvetron from '@salve-software/salvetron-react-native';
import { NoteSchema } from './src/schemas/NoteSchema';
import { NotesScreen } from './src/screens/NotesScreen';

if (__DEV__) {
  Salvetron.connect({ host: 'localhost', port: 8765 });
}

function App(): React.JSX.Element {
  return (
    <SafeAreaProvider>
      <SalveDbProvider config={{ name: 'salve-db-example' }} schemas={[NoteSchema]}>
        <NotesScreen />
      </SalveDbProvider>
    </SafeAreaProvider>
  );
}

export default App;
