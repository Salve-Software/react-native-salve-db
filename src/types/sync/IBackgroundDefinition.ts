/** Background sync configuration */
export interface IBackgroundDefinition {
  enabled: boolean;
  minimumInterval: number;
  requiresNetwork?: boolean;
  requiresCharging?: boolean;
}
