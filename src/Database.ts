import { NitroModules } from 'react-native-nitro-modules'
import type { SalveDatabase } from './specs/SalveDatabase.nitro'
import type { SalveQuery } from './specs/SalveQuery.nitro'
import type { IDatabaseConfigDefinition } from './types/sync/database-config-definition'
import type { AnySchema } from './types/schema/any-schema'
import { QueryClient } from './query/QueryClient'

const _dbBridge = NitroModules.createHybridObject<SalveDatabase>('SalveDatabase')
const _queryBridge = NitroModules.createHybridObject<SalveQuery>('SalveQuery')

let _configured = false

export const Database = {
  /**
   * Configures the database. Must be called once, before any other operation.
   * Opens the SQLite file at the platform documents directory using `config.name`.
   */
  configure(config: IDatabaseConfigDefinition): void {
    if (!config.name || config.name.trim() === '') {
      throw new Error("Database.configure: 'name' is required")
    }
    _dbBridge.configure(JSON.stringify(config))
    _configured = true
  },

  /**
   * Registers a schema. Triggers the native Migration Engine:
   * creates the table if absent, adds missing columns for new schema versions.
   * Must be called after `Database.configure()`.
   */
  register({ schema }: { schema: AnySchema }): Promise<void> {
    if (!_configured) {
      throw new Error('Database.register: call Database.configure() before registering schemas')
    }
    if (!schema.name || typeof schema.version !== 'number' || !schema.primaryKey) {
      throw new Error(
        "Database.register: schema must have 'name', 'version', and 'primaryKey'"
      )
    }
    if (!(schema.primaryKey in schema.columns)) {
      throw new Error(
        `Database.register: primaryKey '${String(schema.primaryKey)}' must exist in schema.columns`
      )
    }
    return _dbBridge.registerSchema(JSON.stringify(schema))
  },
}

/** Type-safe query client. Use after `Database.configure()`. */
export const db = new QueryClient(_queryBridge)
