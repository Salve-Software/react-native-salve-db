import type { ICredentialsDefinition } from "./ICredentialsDefinition";

export interface IConfigureProps {
  name: string;
  baseUrl?: string;
  network?: {
    timeout: number;
  };
  credentials?: ICredentialsDefinition;
}
