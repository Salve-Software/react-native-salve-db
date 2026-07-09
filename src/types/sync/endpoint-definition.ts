import type { HttpMethod } from "./http-method";
import type { IAuthenticationDefinition } from "./authentication-definition";

/** HTTP endpoint for an {@link ISyncDefinition}. */
export interface IEndpointDefinition {
  method: HttpMethod;

  path: string;

  headers?: Record<string, string>;

  authentication?: IAuthenticationDefinition;
}
