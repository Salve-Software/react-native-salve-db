import type { SyncDirection } from "./SyncDirection";
import type { SyncStrategy } from "./SyncStrategy";
import type { ConflictStrategy } from "./ConflictStrategy";
import type { Transport } from "./ITransport";
import type { IEndpointDefinition } from "./IEndpointDefinition";
import type { IBackgroundDefinition } from "./IBackgroundDefinition";
import type { IPaginationDefinition } from "./IPaginationDefinition";
import type { IRequestDefinition } from "./IRequestDefinition";
import type { IResponseDefinition } from "./IResponseDefinition";

/** Sync contract */
export interface ISyncDefinition<TEntity> {
  enabled: boolean;
  direction: SyncDirection;
  strategy: SyncStrategy;
  conflict: ConflictStrategy;
  transport: Transport;
  endpoint: IEndpointDefinition;
  background?: IBackgroundDefinition;
  pagination?: IPaginationDefinition;
  request: IRequestDefinition<TEntity>;
  response: IResponseDefinition<TEntity>;
}
