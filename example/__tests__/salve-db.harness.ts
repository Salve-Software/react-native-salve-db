import { describe, it, expect } from 'react-native-harness'
import { salveDatabase, salveQuery, salveSync } from 'react-native-salve-db'

describe('SalveDb', () => {
  it('exposes SalveDatabase HybridObject', () => {
    expect(salveDatabase).toBeDefined()
  })

  it('exposes SalveQuery HybridObject', () => {
    expect(salveQuery).toBeDefined()
  })

  it('exposes SalveSync HybridObject', () => {
    expect(salveSync).toBeDefined()
  })
})
