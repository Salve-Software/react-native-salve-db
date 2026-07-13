# MVP Scope

> Consolidação das decisões de escopo tomadas em sessão de refinamento. Resolve inconsistências entre `overview.md` e `architecture.md`. Este doc é a fonte de verdade pro MVP. Contrato da camada de query/ORM vive em [`query-layer.md`](./query-layer.md).

---

## Visão (inalterada)

SQLite offline-first pra React Native. Sync engine roda 100% na camada nativa (Swift/Kotlin), sem inicializar JS em background. Schemas e contrato de sync são declarativos (TypeScript), interpretados pelo Native Sync Engine.

---

## Escopo MVP

| Área | Decisão | Motivo |
|---|---|---|
| **Sync strategy** | só `operations` (queue-based diff via triggers) | menor engine, cobre a maioria dos casos, já era o recomendado no overview |
| **Conflict resolution** | só `lastWriteWins` | determinístico, sem UI de merge, sem fila de conflito manual |
| **Auth** | OAuth2 com refresh 100% nativo (Keychain/Keystore) | é o diferencial central do pitch, vale investir cedo |
| **Auth scope** | **global único**, configurado em `Database.configure()` | remove ambiguidade global-vs-per-endpoint do architecture.md original |
| **Background sync** | scheduler nativo dia 1 (WorkManager + BGTaskScheduler) | é a proposta de valor central ("sem JS em background") |
| **Migrations** | auto-diff de coluna (`ADD COLUMN` automático por diff de `version`) | sem scripts up/down, sem DROP/RENAME (destrutivo fica fora) |
| **Retry** | fixo global: 3 tentativas, 5s delay, hardcoded no native engine (sem chave declarativa nova) | scheduler roda sem supervisão, precisa de piso mínimo de resiliência sem inflar contrato |
| **Transport** | só REST implementado | reduz superfície do HTTP Client nativo |
| **Request `$ref` vars** | só `cursor` e `operations` | são os únicos efetivamente usados pelo contrato de `operations` strategy |
| **Migration / coluna removida** | ignora silenciosamente — coluna órfã fica no SQLite sem uso, só `ADD COLUMN` é aplicado | sem `DROP COLUMN` (destrutivo, suporte caro/limitado no SQLite); mantém coerência com "sem scripts up/down" |
| **SyncDirection** | só `"bidirectional"` | cobre o caso de uso principal (offline-first com escrita local); push-only/pull-only ficam pra quando aparecer schema read-only ou write-only real |
| **Paginação** | leve: `pageSize` + `hasMore`, engine faz loop dentro da mesma sessão de conectividade até `hasMore: false` ou teto `maxPagesPerSession` (default 20) | sem paginação, primeira sync de dataset/fila grande vira request/response sem limite — problema real, não cosmético. Sem page tokens/Link headers (isso fica pra depois) |
| **Query layer (ORM)** | CRUD básico (select/insert/update/delete/count, where/orderBy/limit/offset), insert em lote (`values()` aceita array) e upsert (`onConflictDoUpdate()` por primary key), inspirado no Drizzle. Ver [`query-layer.md`](./query-layer.md) | sem API de leitura/escrita, "banco" não tem como ser usado; é peça fundamental, não extra |
| **Execução de query** | JS monta SQL string + params, native executa via JSI com cache de prepared statement | mais performático que compilar AST no native: gargalo real é I/O do SQLite, não geração da string; evita reimplementar query-compiler em Swift E Kotlin |
| **Transactions** | `db.transaction(cb)` — BEGIN/COMMIT/ROLLBACK nativo | barato de expor, evita estado inconsistente em writes relacionados (ex: pedido + itens) |
| **Raw SQL** | `db.execute(sql, params)` como escape hatch, sem type-safety | builder não cobre 100% dos casos; como trigger é a nível de tabela, raw SQL ainda fica rastreado pela sync_queue |
| **Tipo de `datetime`** | mapeado pra `number` (epoch millis) no TS, não `Date` | mesma convenção já usada em `SyncOperation.updatedAt`, evita ambiguidade de timezone |
| **Trigger bypass no apply do sync** | tabela `_sync_apply_lock` (1 linha), trigger usa `WHEN NOT EXISTS (SELECT 1 FROM _sync_apply_lock)`. Engine faz `INSERT`/apply/`DELETE` numa única transação. SQL completo em [`query-layer.md`](./query-layer.md#trigger-bypass-durante-apply-do-sync) | sem isso, dado baixado do servidor reentra na sync_queue como se fosse mudança local — loop |

## Fora do MVP (tipado como futuro, não implementado)

- `incremental` / `full` sync strategy
- `serverWins` / `clientWins` / `manual` conflict strategy
- `basic` / `custom` auth strategy
- `graphql` / `grpc` transport
- `RetryDefinition` configurável por schema (fixed/linear/exponential)
- `CompressionDefinition`, `EncryptionDefinition`
- `$ref`: `deviceId`, `platform`, `timestamp`, `userId`, `changes` — multi-device tracking fica pra depois
- Batch Sync, Sync Dependencies, Delta Compression, ETag, Pagination, Multipart Upload, WebSocket Sync, Push-triggered Sync, Multi-tenant Sync, Partial/Field-level conflict, protocolos custom (já listados em `architecture.md`)
- Query layer: relations/joins, agregações (count/sum/avg/groupBy), `ilike`/`between`/subqueries, `returning()`, streaming de resultado grande (ver `query-layer.md`)

Tipos não implementados continuam existindo no union (não quebram contrato futuro); engine lança erro explícito se alguém tentar usar.

---

## Inconsistências resolvidas

1. **Credentials/refresh sem home no architecture.md** → agora vive em `Database.configure()`, global, único provider por app. `EndpointDefinition.authentication` sai do MVP.
2. **`Database.configure()` sem contrato tipado** → precisa ser formalizado (`DatabaseConfigDefinition` com `baseUrl`, `network.timeout`, `credentials`).
3. **Background per-schema vs wake global** → `BackgroundDefinition` continua per-schema (`minimumInterval`, `requiresNetwork`), mas existe **um único job nativo** (WorkManager/BGTaskScheduler) que acorda o engine, que por sua vez itera todos os schemas com `background.enabled: true`. Não é um job por schema.
4. **Migration Engine sem comportamento definido** → auto-diff de coluna por `version`, sem scripts.
5. **Paginação ausente do fluxo principal** (só citada em "Futuras extensões" do architecture.md) → `PaginationDefinition` (`pageSize` + `maxPagesPerSession`) entra no MVP, engine faz loop de página dentro da mesma sessão de sync via `hasMore`.

---

## Contrato mínimo (MVP)

Cada decisão fixa vira um **type próprio** (não literal inline) — union de 1 membro hoje, cresce sem quebrar quem já consome o tipo quando o MVP escalar.

```ts
/**
 * Estratégia de sincronização.
 *
 * MVP: só "operations" (queue-based diff via trigger engine).
 * Escala futura: "incremental" (pull por cursor, catch-up de dataset grande)
 * e "full" (snapshot completo) entram aqui como novos membros da union —
 * não é um novo type, é o mesmo SyncStrategy crescendo.
 */
export type SyncStrategy = "operations";

/**
 * Estratégia de resolução de conflito.
 *
 * MVP: só "lastWriteWins" (client e server comparam updatedAt, maior vence).
 * Escala futura: "serverWins" | "clientWins" | "manual" (exige fila de
 * conflito + UI de resolução, por isso fica de fora até ter demanda real).
 */
export type ConflictStrategy = "lastWriteWins";

/**
 * Protocolo de transporte do Native HTTP Client.
 *
 * MVP: só "rest". "graphql" e "grpc" exigem client nativo próprio por
 * protocolo — entram quando houver um caso de uso concreto pra cada um.
 */
export type Transport = "rest";

/**
 * Direção de sincronização do schema.
 *
 * MVP: só "bidirectional" (cobre o caso de uso central: escrita local +
 * sync remoto). "push" (write-only, ex: telemetry) e "pull" (read-only,
 * ex: catálogo/reference data) entram quando aparecer um schema real
 * que só precisa de um lado.
 */
export type SyncDirection = "bidirectional";

/**
 * Provider de autenticação/credenciais.
 *
 * MVP: só "oauth2", com refresh 100% nativo. "basic" e "custom" (do
 * AuthStrategy do architecture.md) ficam de fora até haver API parceira
 * que exija outro esquema.
 */
export type AuthProvider = "oauth2";
```

Reduz `SyncDefinition` do `architecture.md` usando os types acima (em vez de literais soltos):

```ts
export interface SyncDefinition<TEntity> {
  enabled: boolean;
  direction: SyncDirection;
  strategy: SyncStrategy;
  conflict: ConflictStrategy;
  transport: Transport;
  endpoint: {
    method: HttpMethod;
    path: string;
    headers?: Record<string, string>;
  };
  background?: BackgroundDefinition;
  pagination: PaginationDefinition;
  request: {
    body: {
      cursor: { $ref: "cursor" };
      operations: { $ref: "operations" };
      pageSize: { $ref: "pageSize" };
    };
  };
  response: {
    cursor?: JsonPath;
    operations?: JsonPath;
    hasMore?: JsonPath;
  };
}

/**
 * Sem paginação, primeira sync de dataset/fila grande vira request/response
 * sem limite. MVP: versão leve, sem page tokens/Link headers.
 */
export interface PaginationDefinition {
  /** Itens por página — usado no pull ($ref: "pageSize") e no batch do push. */
  pageSize: number;

  /**
   * Teto de páginas por sessão de conectividade. Evita loop longo
   * drenando bateria numa única wake do scheduler; se sobrar dado,
   * retoma no próximo wake via cursor já avançado.
   * @default 20
   */
  maxPagesPerSession?: number;
}
```

Novo contrato global (não existia formalizado):

```ts
export interface DatabaseConfigDefinition {
  baseUrl: string;

  network?: {
    timeout: number;
  };

  /**
   * Credencial única e global do app — não existe override por schema
   * no MVP (ver "Inconsistências resolvidas" #1). Se um dia for preciso
   * suportar múltiplas APIs com credenciais distintas, este campo vira
   * um Record<string, CredentialsDefinition> chaveado por provider/API,
   * sem quebrar quem só usa uma.
   */
  credentials: CredentialsDefinition;
}

export interface CredentialsDefinition {
  provider: AuthProvider;

  /** Onde e como o access token viaja nas requests. */
  accessToken: {
    /** @default "Authorization" */
    headerName?: string;
  };

  /**
   * Contrato de refresh. Disparado pelo native engine quando um
   * request de sync recebe 401 — JS nunca participa desse fluxo.
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

## Aberto / próximo debate

Nenhum item aberto no momento.
