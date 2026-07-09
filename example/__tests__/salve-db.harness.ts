import { describe, it, expect } from 'react-native-harness'
import { salveDb } from 'react-native-salve-db'

describe('SalveDb', () => {
  it('calls the native implementation', () => {
    expect(salveDb.sum(1, 2)).toBe(3)
  })
})
