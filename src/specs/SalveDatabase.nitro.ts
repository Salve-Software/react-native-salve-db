import type { HybridObject } from "react-native-nitro-modules";
import type { IDatabaseConfigDefinition } from "../types/sync/database-config-definition";
import type { ISchemaDefinition } from "../types/schema/schema-definition";
import type { RequestExpression } from "../types/sync/request-expression";

/**
 * JSI bridge for database lifecycle: global configuration and schema
 * registration. Triggers the native Migration Engine in {@linkcode registerSchema}.
 *
 * Both methods accept a JSON `string` payload, not a Nitro struct:
 * {@linkcode IDatabaseConfigDefinition} and {@linkcode ISchemaDefinition} use
 * generics, `keyof`, a dynamic-key `Record`, and recursive unions
 * ({@linkcode RequestExpression}) that Nitrogen can't generate as a native
 * struct. Both calls are cold-path (once per app / once per schema), so the
 * `JSON.stringify`/parse cost is irrelevant — JS serializes the real type,
 * C++ parses it.
 */
export interface SalveDatabase extends HybridObject<{ ios: "c++"; android: "c++" }> {
  /**
   * Configures the global connection (baseUrl, credentials, network timeout).
   * @param configJson `JSON.stringify` of a {@linkcode IDatabaseConfigDefinition}.
   */
  configure(configJson: string): void;

  /**
   * Registers a declarative schema, triggering the native Migration Engine
   * (version diff, automatic `ADD COLUMN`).
   * @param schemaJson `JSON.stringify` of a {@linkcode ISchemaDefinition}.
   */
  registerSchema(schemaJson: string): Promise<void>;
}
