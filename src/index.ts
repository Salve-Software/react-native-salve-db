import { NitroModules } from "react-native-nitro-modules";
import type { SalveDatabase } from "./specs/SalveDatabase.nitro";
import type { SalveQuery } from "./specs/SalveQuery.nitro";
import type { SalveSync } from "./specs/SalveSync.nitro";

// Shared
export type { JsonPath } from "./contracts/json-path";

// Schema contracts
export type { AnySchema } from "./contracts/schema/any-schema";
export type { ColumnDefinition, ColumnTsType } from "./contracts/schema/column-definition";
export type { IndexDefinition } from "./contracts/schema/index-definition";
export type { SchemaDefinition } from "./contracts/schema/schema-definition";

// Sync primitives
export type { HttpMethod } from "./contracts/sync/http-method";
export type { SyncDirection } from "./contracts/sync/sync-direction";
export type { SyncStrategy } from "./contracts/sync/sync-strategy";
export type { ConflictStrategy } from "./contracts/sync/conflict-strategy";
export type { AuthStrategy } from "./contracts/sync/auth-strategy";
export type { Transport } from "./contracts/sync/transport";
export type { AuthProvider } from "./contracts/sync/auth-provider";

// Sync definitions
export type { AuthenticationDefinition } from "./contracts/sync/authentication-definition";
export type { CredentialsDefinition } from "./contracts/sync/credentials-definition";
export type { DatabaseConfigDefinition } from "./contracts/sync/database-config-definition";
export type { EndpointDefinition } from "./contracts/sync/endpoint-definition";
export type { BackgroundDefinition } from "./contracts/sync/background-definition";
export type { PaginationDefinition } from "./contracts/sync/pagination-definition";
export type {
  RequestExpression,
  VariableExpression,
  ConstantExpression,
  ObjectExpression,
  ArrayExpression,
} from "./contracts/sync/request-expression";
export type { RequestDefinition } from "./contracts/sync/request-definition";
export type { ResponseDefinition } from "./contracts/sync/response-definition";
export type { SyncDefinition } from "./contracts/sync/sync-definition";
export type { SyncOperation } from "./contracts/sync/sync-operation";
export type { NativeSyncResult } from "./contracts/sync/native-sync-result";
export type { RetryDefinition } from "./contracts/sync/retry-definition";
export type { CompressionDefinition } from "./contracts/sync/compression-definition";
export type { EncryptionDefinition } from "./contracts/sync/encryption-definition";

// Query / ORM contracts
export type { CompiledQuery } from "./contracts/query/compiled-query";
export type { Condition } from "./contracts/query/condition";
export type { InferSelectModel, InferInsertModel } from "./contracts/query/infer-model";
export type {
  QueryClient,
  SelectQueryBuilder,
  InsertQueryBuilder,
  UpdateQueryBuilder,
  DeleteQueryBuilder,
} from "./contracts/query/query-client";

// Operator values (declared functions — not types)
export { eq, ne, gt, gte, lt, lte, like, inArray, isNull, isNotNull, and, or, not } from "./contracts/query/operators";

// Nitro marshaling types
export type { SqlValue, QueryResult } from "./specs/types/sql-value";

// HybridObjects
export const salveDatabase = NitroModules.createHybridObject<SalveDatabase>("SalveDatabase");
export const salveQuery = NitroModules.createHybridObject<SalveQuery>("SalveQuery");
export const salveSync = NitroModules.createHybridObject<SalveSync>("SalveSync");

export type { SalveDatabase } from "./specs/SalveDatabase.nitro";
export type { SalveQuery } from "./specs/SalveQuery.nitro";
export type { SalveSync } from "./specs/SalveSync.nitro";
