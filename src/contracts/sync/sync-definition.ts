import type { SyncDirection } from "./sync-direction";
import type { SyncStrategy } from "./sync-strategy";
import type { ConflictStrategy } from "./conflict-strategy";
import type { Transport } from "./transport";
import type { EndpointDefinition } from "./endpoint-definition";
import type { BackgroundDefinition } from "./background-definition";
import type { PaginationDefinition } from "./pagination-definition";
import type { RequestDefinition } from "./request-definition";
import type { ResponseDefinition } from "./response-definition";

/** Contrato de sincronização de um {@link SchemaDefinition}. */
export interface SyncDefinition<TEntity> {
  enabled: boolean;

  direction: SyncDirection;

  strategy: SyncStrategy;

  conflict: ConflictStrategy;

  transport: Transport;

  endpoint: EndpointDefinition;

  background?: BackgroundDefinition;

  /**
   * MVP: presente sempre que strategy = "operations". Controla tanto
   * o tamanho da página que o engine pede no pull quanto o tamanho do
   * lote de sync_queue enviado no push — um único número, um único
   * mental model.
   */
  pagination?: PaginationDefinition;

  request: RequestDefinition<TEntity>;

  response: ResponseDefinition<TEntity>;
}
