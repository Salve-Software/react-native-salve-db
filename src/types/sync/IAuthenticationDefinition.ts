import type { AuthStrategy } from "./AuthStrategy";

/**
 * Per-endpoint authentication.
 */
export interface IAuthenticationDefinition {
  strategy: AuthStrategy;
  tokenKey?: string;
  headerName?: string;
}
