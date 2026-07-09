import type { AuthStrategy } from "./auth-strategy";

/**
 * Per-endpoint authentication.
 *
 * Out of MVP scope. Auth in the MVP is global and single (see {@link ICredentialsDefinition}).
 * Reserved for when there is a real use case for multiple APIs/credentials per schema.
 */
export interface IAuthenticationDefinition {
  strategy: AuthStrategy;

  tokenKey?: string;

  headerName?: string;
}
