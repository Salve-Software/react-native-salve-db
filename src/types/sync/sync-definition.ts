import type { SyncDirection } from "./sync-direction";
import type { SyncStrategy } from "./sync-strategy";
import type { ConflictStrategy } from "./conflict-strategy";
import type { Transport } from "./transport";
import type { IEndpointDefinition } from "./endpoint-definition";
import type { IBackgroundDefinition } from "./background-definition";
import type { IPaginationDefinition } from "./pagination-definition";
import type { IRequestDefinition } from "./request-definition";
import type { IResponseDefinition } from "./response-definition";

/** Sync contract for an {@link ISchemaDefinition}. */
export interface ISyncDefinition<TEntity> {
  enabled: boolean;

  direction: SyncDirection;

  strategy: SyncStrategy;

  conflict: ConflictStrategy;

  transport: Transport;

  endpoint: IEndpointDefinition;

  background?: IBackgroundDefinition;

  /**
   * MVP: present whenever strategy = "operations". Controls both the page size
   * the engine requests on pull and the sync_queue batch size on push — one
   * number, one mental model.
   */
  pagination?: IPaginationDefinition;

  request: IRequestDefinition<TEntity>;

  response: IResponseDefinition<TEntity>;
}
