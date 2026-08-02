import type { SyncDirection } from "./SyncDirection";
import type { ConflictStrategy } from "./ConflictStrategy";
import type { Transport } from "./ITransport";
import type { IEndpointDefinition } from "./IEndpointDefinition";
import type { IBackgroundDefinition } from "./IBackgroundDefinition";
import type { IPaginationDefinition } from "./IPaginationDefinition";

/**
 * Conflict resolution config. (The incremental-pull cursor's timestamp field
 * is a separate, always-required setting, independent of strategy:
 * `endpoint.cursorField`.)
 */
export type ConflictConfig =
  | {
      strategy: Extract<ConflictStrategy, "lastWriteWins">;
      /**
       * Names the column — declared in the local schema (`columns[field]`)
       * and present in the API payload — compared to resolve conflicts:
       * whichever side has the newer value wins. Configurable so an API's
       * own naming convention can be used instead of forcing `updatedAt`.
       *
       * Must reference a `columns` entry declared as `{ type: "datetime",
       * nullable: false }` — `Database.register()` throws at registration
       * time if it doesn't (a non-datetime or missing column can't be
       * compared as a timestamp).
       * @default "updatedAt"
       */
      field?: string;
    }
  | {
      /** The server's pulled row always overwrites the local row, regardless of any local edit. */
      strategy: Extract<ConflictStrategy, "serverWins">;
    }
  | {
      /** An existing local row is never overwritten by a pulled server row; a row that doesn't exist locally yet still gets inserted. */
      strategy: Extract<ConflictStrategy, "clientWins">;
    };

/** Sync contract */
export interface ISyncDefinition {
  /** Whether this schema participates in sync at all — gates every trigger (read, write, app-open, background). */
  enabled: boolean;

  /** Direction of sync. MVP only supports `"bidirectional"`. */
  direction: SyncDirection;

  /** How pull conflicts (server row vs. existing local row) get resolved. */
  conflict: ConflictConfig;

  /** Transport protocol. MVP only supports `"rest"`. */
  transport: Transport;

  /** REST module contract for this entity: base path, query params, cursor field. */
  endpoint: IEndpointDefinition;

  /**
   * Intended to gate whether this schema participates in the background
   * sync wake. Not yet consulted natively — `triggerSyncAll` currently runs
   * every `sync.enabled` schema regardless of this flag.
   */
  background?: IBackgroundDefinition;

  /** Pull page size and per-session page cap. @default undefined (falls back to the engine's own defaults) */
  pagination?: IPaginationDefinition;
}
