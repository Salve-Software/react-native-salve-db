import type { SyncDirection } from "./SyncDirection";
import type { ConflictStrategy } from "./ConflictStrategy";
import type { Transport } from "./ITransport";
import type { IEndpointDefinition } from "./IEndpointDefinition";
import type { IBackgroundDefinition } from "./IBackgroundDefinition";
import type { IPaginationDefinition } from "./IPaginationDefinition";

/** Sync contract */
export interface ISyncDefinition {
  enabled: boolean;
  direction: SyncDirection;
  conflict: ConflictStrategy;
  transport: Transport;
  endpoint: IEndpointDefinition;
  background?: IBackgroundDefinition;
  pagination?: IPaginationDefinition;
}
