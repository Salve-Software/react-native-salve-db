import type { CredentialsDefinition } from "./credentials-definition";

/**
 * Contrato do `Database.configure()`. Fonte de credenciais única do MVP.
 */
export interface DatabaseConfigDefinition {
  baseUrl: string;

  network?: {
    timeout: number;
  };

  /**
   * Credencial única e global do app. Sem override por schema no MVP.
   * Escala futura: vira `Record<string, CredentialsDefinition>` chaveado
   * por provider/API, sem quebrar quem só usa uma credencial.
   */
  credentials: CredentialsDefinition;
}
