/** Configuração de sync em background de um {@link SyncDefinition}. */
export interface BackgroundDefinition {
  enabled: boolean;

  minimumInterval: number;

  requiresNetwork?: boolean;

  requiresCharging?: boolean;
}
