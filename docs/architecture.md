# Sync Engine Contracts

> Objetivo: toda a sincronização deve ser **100% declarativa**, permitindo que um Native Sync Engine execute as tarefas sem precisar inicializar a camada JavaScript.

> Este doc tipa a **visão completa** dos contratos (superset). Muitos membros de union abaixo estão reservados pro futuro e não são implementados no MVP. Ver [`docs/mvp-scope.md`](./mvp-scope.md) pro subset exato fixo do MVP — os comentários `// MVP:` abaixo apontam o que já vale hoje.

---

# Primitive Types

```ts
export type HttpMethod =
  | "GET"
  | "POST"
  | "PUT"
  | "PATCH"
  | "DELETE";

export type SyncDirection =
  | "bidirectional"  // MVP: única implementada
  | "push"
  | "pull";

export type SyncStrategy =
  | "operations"      // MVP: única implementada
  | "incremental"
  | "full";

export type ConflictStrategy =
  | "lastWriteWins"    // MVP: única implementada
  | "serverWins"
  | "clientWins"
  | "manual";

export type AuthStrategy =
  | "none"
  | "bearer"
  | "basic"
  | "custom";

export type Transport =
  | "rest"    // MVP: única implementada
  | "graphql"
  | "grpc";

/**
 * Provider de credenciais global (Database.configure().credentials.provider).
 * Não confundir com AuthStrategy, que é por-endpoint (ver Authentication)
 * e está fora do MVP — MVP usa só credenciais globais via AuthProvider.
 */
export type AuthProvider =
  | "oauth2";   // MVP: única implementada
```

---

# Schema Contract

```ts
export interface SchemaDefinition<TEntity> {

    /**
     * Nome único do schema.
     *
     * Ex:
     * customers
     */
    name: string;

    /**
     * Versão utilizada para migrações.
     */
    version: number;

    /**
     * Primary key.
     */
    primaryKey: keyof TEntity;

    /**
     * Colunas.
     */
    columns: Record<string, ColumnDefinition>;

    /**
     * Índices.
     */
    indexes?: IndexDefinition[];

    /**
     * Contrato de sincronização.
     */
    sync?: SyncDefinition<TEntity>;

}
```

---

# Column

```ts
export interface ColumnDefinition {

    type:
        | "text"
        | "integer"
        | "real"
        | "boolean"
        | "blob"
        | "datetime";

    nullable?: boolean;

    unique?: boolean;

    default?: unknown;

}
```

---

# Index

```ts
export interface IndexDefinition {

    name: string;

    columns: string[];

    unique?: boolean;

}
```

---

# Sync Definition

```ts
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
```

---

# Endpoint

```ts
export interface EndpointDefinition {

    method: HttpMethod;

    path: string;

    headers?: Record<string, string>;

    authentication?: AuthenticationDefinition;

}
```

---

# Authentication

> **Fora do MVP.** Auth no MVP é global e única (ver `CredentialsDefinition` abaixo), configurada em `Database.configure()` — não por endpoint. Este tipo fica reservado pra quando houver caso real de múltiplas APIs/credenciais distintas por schema.

```ts
export interface AuthenticationDefinition {

    strategy: AuthStrategy;

    tokenKey?: string;

    headerName?: string;

}
```

---

# Database Config (global)

> Contrato do `Database.configure()`, referenciado no overview.md mas nunca antes tipado aqui. É a fonte de credenciais única do MVP.

```ts
export interface DatabaseConfigDefinition {

    baseUrl: string;

    network?: {
        timeout: number;
    };

    /**
     * Credencial única e global do app. Sem override por schema no MVP.
     * Escala futura: vira Record<string, CredentialsDefinition> chaveado
     * por provider/API, sem quebrar quem só usa uma credencial.
     */
    credentials: CredentialsDefinition;

    /**
     * Agenda do job nativo de background (WorkManager/BGTaskScheduler).
     * Existe um único job global, não um por schema — por isso a agenda
     * vive aqui, não em `SyncDefinition.background`. Omitido = nenhum job
     * agendado (background sync desligado).
     */
    background?: BackgroundParams;

}
```

---

# Credentials

```ts
export interface CredentialsDefinition {

    provider: AuthProvider;

    /** Onde o access token viaja nas requests de sync. */
    accessToken: {
        /** @default "Authorization" */
        headerName?: string;
    };

    /**
     * Par de tokens inicial, obtido pelo próprio fluxo de login do app
     * (fora do escopo desta lib) antes de chamar `configure()`. Persistido
     * nativamente (Keychain/Keystore) uma única vez — chamadas seguintes de
     * `configure()` (ex: reabrir o app) não sobrescrevem um token já
     * refreshado nativamente desde então.
     */
    tokens?: {
        accessToken: string;
        refreshToken: string;
    };

    /**
     * Contrato de refresh. Disparado pelo Native Sync Engine quando um
     * request de sync recebe 401 — JavaScript nunca participa.
     */
    refresh: {
        endpoint: string;
        request: {
            refreshToken: { $ref: "refreshToken" };
        };
        response: {
            accessToken: JsonPath;
            refreshToken: JsonPath;
        };
    };

}
```

---

# Background

Per-schema — só decide se o schema participa da wake do job global, lido pelo Sync Orchestrator quando o job já acordou:

```ts
export interface BackgroundDefinition {

    enabled: boolean;

}
```

Global — a agenda do job em si, em `DatabaseConfigDefinition.background` (ver seção "Database Config" acima):

```ts
export interface BackgroundParams {

    minimumInterval: number;

    requiresNetwork?: boolean;

    requiresCharging?: boolean;

}
```

---

# Pagination

Sem isso, primeira sync de um dataset grande (ou fila de push grande) vira um único request/response sem limite. MVP implementa uma versão leve: sem page tokens, sem Link headers — só `pageSize` + `hasMore`, reaproveitando `$ref`/`JsonPath` que já existem no contrato.

```ts
export interface PaginationDefinition {

    /**
     * Itens por página. Usado tanto no `$ref: "pageSize"` da request
     * (pull) quanto pra limitar quantas linhas da sync_queue entram
     * num request de push.
     */
    pageSize: number;

    /**
     * Teto de páginas por sessão de sync (mesma janela de conectividade).
     * Evita loop longo demais drenando bateria numa única wake do
     * scheduler. Ao atingir o teto com hasMore ainda true, o engine para
     * e retoma no próximo wake — cursor já avançou até onde deu.
     *
     * @default 20
     */
    maxPagesPerSession?: number;

}
```

Fluxo do engine com paginação (loop dentro da mesma sessão):

```text
Ler sync_queue (até pageSize)
│
▼
Enviar página ao servidor
│
▼
Aplicar operations da resposta
│
▼
Atualizar cursor
│
▼
hasMore && páginas < maxPagesPerSession?
│
├── sim → repete
│
└── não → limpa fila processada, encerra sessão
```

---

# Request Contract

Toda a request é declarativa.

Nenhuma função JavaScript.

```ts
export interface RequestDefinition<TEntity> {

    body: Record<string, RequestExpression>;

}
```

---

# Response Contract

```ts
export interface ResponseDefinition<TEntity> {

    cursor?: JsonPath;

    operations?: JsonPath;

    entities?: JsonPath;

    deleted?: JsonPath;

    metadata?: JsonPath;

    /** MVP: usado junto de PaginationDefinition pra controlar o loop de páginas. */
    hasMore?: JsonPath;

}
```

---

# Request Expressions

O Native Engine entende essas expressões.

```ts
export type RequestExpression =
    | VariableExpression
    | ConstantExpression
    | ObjectExpression
    | ArrayExpression;
```

---

```ts
export interface VariableExpression {

    $ref:
        | "cursor"       // MVP
        | "operations"   // MVP
        | "pageSize"     // MVP — vem de PaginationDefinition.pageSize
        | "changes"
        | "deviceId"
        | "platform"
        | "timestamp"
        | "userId";

}
```

---

```ts
export interface ConstantExpression {

    value: unknown;

}
```

---

```ts
export interface ObjectExpression {

    object: Record<string, RequestExpression>;

}
```

---

```ts
export interface ArrayExpression {

    items: RequestExpression[];

}
```

---

# JSON Path

```ts
export type JsonPath = string;
```

Exemplo:

```text
$.cursor

$.data

$.changes

$.metadata.version
```

---

# Sync Operations

```ts
export interface SyncOperation {

    operation:

        | "insert"

        | "update"

        | "delete";

    entity: string;

    primaryKey: string;

    payload: Record<string, unknown>;

    updatedAt: number;

}
```

---

# Native Sync Result

```ts
export interface NativeSyncResult {

    cursor?: string;

    operationsApplied: number;

    inserted: number;

    updated: number;

    deleted: number;

    duration: number;

}
```

---

# Retry

> **Fora do MVP como contrato por-schema.** MVP usa retry fixo e global, hardcoded no native engine (3 tentativas, 5s delay) — sem chave declarativa nova, sem `RetryDefinition` referenciado em nenhum `SyncDefinition`. Este tipo fica reservado pra quando algum schema precisar de política própria.

```ts
export interface RetryDefinition {

    enabled: boolean;

    maxAttempts: number;

    backoff:

        | "fixed"

        | "linear"

        | "exponential";

    delay: number;

}
```

---

# Compression

> **Fora do MVP.** Não referenciado em nenhum `SyncDefinition` ainda.

```ts
export interface CompressionDefinition {

    enabled: boolean;

    algorithm:

        | "gzip"

        | "brotli";

}
```

---

# Encryption

> **Fora do MVP.** Não referenciado em nenhum `SyncDefinition` ainda.

```ts
export interface EncryptionDefinition {

    enabled: boolean;

    algorithm:

        | "aes256";

}
```

---

# Complete Example

```ts
export const CustomerSchema = {

    name: "customers",

    version: 1,

    primaryKey: "id",

    columns: {

        id: {

            type: "text"

        },

        name: {

            type: "text"

        },

        phone: {

            type: "text"

        }

    },

    sync: {

        enabled: true,

        direction: "bidirectional",

        strategy: "operations",

        conflict: "lastWriteWins",

        transport: "rest",

        endpoint: {

            method: "POST",

            path: "/sync/customers"

            // auth é global via Database.configure().credentials — ver CredentialsDefinition

        },

        background: {

            enabled: true

        },

        pagination: {

            pageSize: 200,

            maxPagesPerSession: 20

        },

        request: {

            body: {

                cursor: {

                    $ref: "cursor"

                },

                operations: {

                    $ref: "operations"

                },

                pageSize: {

                    $ref: "pageSize"

                }

            }

        },

        response: {

            cursor: "$.cursor",

            operations: "$.operations",

            hasMore: "$.hasMore"

        }

    }

} satisfies SchemaDefinition<Customer>;
```

# Futuras extensões (não implementadas inicialmente)

- Batch Sync Definition
- Sync Dependencies (`Customer -> Deal -> Activity`)
- Per-table Retry Policies
- Delta Compression
- ETag Support
- Pagination avançada (page tokens, Link headers) — MVP já tem versão leve (`PaginationDefinition`)
- Multipart Upload
- WebSocket Sync
- Push-triggered Sync
- Multi-tenant Sync
- Partial Entity Sync
- Field-level Conflict Resolution
- Custom Sync Protocol (além de REST)
