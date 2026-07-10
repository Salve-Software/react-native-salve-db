import type { HttpMethod } from "./HttpMethod";
import type { IAuthenticationDefinition } from "./IAuthenticationDefinition";

/** HTTP endpoint */
export interface IEndpointDefinition {
  method: HttpMethod;
  path: string;
  headers?: Record<string, string>;
  authentication?: IAuthenticationDefinition;
}
