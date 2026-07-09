import type { AuthStrategy } from "./auth-strategy";

/**
 * Autenticação por-endpoint.
 *
 * Fora do MVP. Auth no MVP é global e única (ver {@link CredentialsDefinition}).
 * Este tipo fica reservado pra quando houver caso real de múltiplas
 * APIs/credenciais distintas por schema.
 */
export interface AuthenticationDefinition {
  strategy: AuthStrategy;

  tokenKey?: string;

  headerName?: string;
}
