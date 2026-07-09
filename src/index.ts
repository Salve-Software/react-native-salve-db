// Public API
export { Database, db } from './Database'

// Schema types
export type { IColumnDefinition } from './types/schema/column-definition'
export type { IIndexDefinition } from './types/schema/index-definition'
export type { ISchemaDefinition } from './types/schema/schema-definition'

// Sync types (used in configure/schema declarations)
export type { IAuthenticationDefinition } from './types/sync/authentication-definition'
export type { ICredentialsDefinition } from './types/sync/credentials-definition'
export type { IDatabaseConfigDefinition } from './types/sync/database-config-definition'
export type { IEndpointDefinition } from './types/sync/endpoint-definition'
export type { IBackgroundDefinition } from './types/sync/background-definition'
export type { IPaginationDefinition } from './types/sync/pagination-definition'
export type { IRequestDefinition } from './types/sync/request-definition'
export type { IResponseDefinition } from './types/sync/response-definition'
export type { ISyncDefinition } from './types/sync/sync-definition'
export type { IRetryDefinition } from './types/sync/retry-definition'
export type { ICompressionDefinition } from './types/sync/compression-definition'
export type { IEncryptionDefinition } from './types/sync/encryption-definition'

// Query types
export type { Condition } from './types/query/condition'
export type { InferSelectModel, InferInsertModel } from './types/query/infer-model'
export type {
  IQueryClient,
  ISelectQueryBuilder,
  IInsertQueryBuilder,
  IUpdateQueryBuilder,
  IDeleteQueryBuilder,
} from './types/query/query-client'

// Query operators (implementations)
export { eq, ne, gt, gte, lt, lte, like, inArray, isNull, isNotNull, and, or, not } from './query/operators'
