import { describe, it, expect } from 'react-native-harness'
import { SalveDb } from 'react-native-salve-db'

describe('SalveDb', () => {
  it('calls the native implementation', () => {
    expect(SalveDb.sum(1, 2)).toBe(3)
  })
})
