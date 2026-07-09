import type { HttpMethod } from "./http-method";
import type { AuthenticationDefinition } from "./authentication-definition";

/** Endpoint HTTP de um {@link SyncDefinition}. */
export interface EndpointDefinition {
  method: HttpMethod;

  path: string;

  headers?: Record<string, string>;

  authentication?: AuthenticationDefinition;
}
