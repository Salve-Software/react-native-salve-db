/** Background sync configuration for an {@link ISyncDefinition}. */
export interface IBackgroundDefinition {
  enabled: boolean;

  minimumInterval: number;

  requiresNetwork?: boolean;

  requiresCharging?: boolean;
}
