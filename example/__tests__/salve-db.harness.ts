import { describe, it, expect } from 'react-native-harness';
import { Database } from '@salve-software/react-native-salve-db';

describe('SalveDb', () => {
  it('exposes Database', () => {
    expect(Database).toBeDefined();
  });
})
