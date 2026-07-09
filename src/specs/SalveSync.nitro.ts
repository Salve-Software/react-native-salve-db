import type { HybridObject } from "react-native-nitro-modules";
import type { NativeSyncResult } from "../contracts/sync/native-sync-result";
import type { SchemaDefinition } from "../contracts/schema/schema-definition";

/**
 * JSI bridge for manual/on-open sync. Calls the native Sync Orchestrator,
 * which runs the full page cycle (read `sync_queue` → send → apply →
 * advance cursor) without involving JS during execution.
 */
export interface SalveSync extends HybridObject<{ ios: "c++"; android: "c++" }> {
  /**
   * Triggers a sync session for the given schema.
   * @param schemaName Name of an already-registered {@linkcode SchemaDefinition} (see `SalveDatabase.registerSchema`).
   */
  triggerSync(schemaName: string): Promise<NativeSyncResult>;
}
