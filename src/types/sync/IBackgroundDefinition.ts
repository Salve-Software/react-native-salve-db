/**
 * Whether this schema participates in the background sync wake — read by the
 * Sync Orchestrator once the single global background job has already woken
 * up. Scheduling itself (`minimumInterval`, `requiresNetwork`,
 * `requiresCharging`) is global, set once in `Database.configure({ background })`,
 * since there is only one native job (not one per schema).
 */
export interface IBackgroundDefinition {
  enabled: boolean;
}
