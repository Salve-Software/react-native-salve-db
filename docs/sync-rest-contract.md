# Sync REST Contract (implementado no motor nativo e no example/)

> **Status:** o motor nativo (`cpp/sync/`), o contrato declarativo TS (`src/types/sync/`) e a migração de estado persistido descritos neste doc estão **implementados** (issue #84). `example/` já sincroniza contra o `packages/salve-db-server` real (`UserSchema`/`ProductSchema`, `SyncTestScreen`) — `mock-sync-server/` e os schemas de teste antigos foram removidos. A cobertura `react-native-harness` também está implementada (`example/src/__harness__/SalveDb.syncPush/syncPull/syncRelations/syncCredentials.harness.ts`). Ver "Decisões fechadas na implementação" no fim deste doc para os pontos que a rodada de discussão original deixou em aberto.
>
> **Referência viva:** [`packages/salve-db-server`](../packages/salve-db-server) implementa exatamente este contrato — um backend REST de referência que qualquer adotante da lib pode ler como "essa é a forma que minha API precisa ter". O README de lá cobre o contrato do ponto de vista do backend; este doc cobre o mesmo contrato do ponto de vista do motor de sync nativo que o consome.

> **Mudança breaking (#115):** `IEndpointDefinition.sinceParam`/`limitParam` foram **removidos**. `listQueryTemplate` (obrigatório) e `itemPathTemplate` (opcional, default `"{basePath}/{id}"`) os substituem — um motor de template `{token}` (não RFC 6570) que monta a query de pull e o path de item a partir de texto livre com buracos `{since}`/`{limit}`/`{cursorField}` (query) e `{basePath}`/`{id}` (item), resolvido contra um vocabulário fechado por contexto. Cobre casos que dois nomes de parâmetro soltos não cobriam (ex: filtro composto `$filter=updatedAt gt {since}&$top={limit}`, ou endereçamento de item estilo OData `{basePath}({id})`). Todo schema existente precisa reescrever `endpoint: { sinceParam, limitParam }` para `endpoint: { listQueryTemplate: "<nome>={since}&<nome>={limit}" }` — `Database.register()` (`SyncContract::fromDefinition` em modo estrito) **rejeita** um schema que ainda declare os campos antigos, não aceita silenciosamente. A única exceção é o caminho de leitura de `_salve_sync_definitions` já persistido (`SyncOrchestrator`, inclusive o wake de sync em background headless, que roda antes de qualquer `register()` ter chance de reescrever a linha): ali, e só ali, `SyncContract::fromDefinition(definition, /*allowLegacyEndpointFallback*/ true)` sintetiza um `listQueryTemplate` equivalente a partir de `sinceParam`/`limitParam` legados em vez de lançar erro — mesmo tratamento de auto-correção que o #84 deu ao cursor, aplicado seletivamente pra não travar sync em background durante a janela entre o app atualizar e o usuário abrir ele em foreground de novo. Ver `cpp/http/UrlTemplate.hpp` pro mecanismo e `src/types/sync/IEndpointDefinition.ts` pro contrato TS atual — o restante deste doc descreve o desenho original do #84 e não foi reescrito linha a linha para refletir o #115.

---

# Por que isso mudou

O contrato batchado atual (`architecture.md`) exige que todo adotante da lib implemente um **endpoint sob medida**: um único `POST` por schema que recebe um lote de `operations` e devolve `operations` (pull) + `ack` (confirmação de id por linha) numa única resposta, com o corpo da request/response mapeado via JSONPath configurável (`$ref`, `$.cursor`, etc.).

Isso é uma barreira de adoção real — nenhum backend já existente fala esse protocolo por acaso. O princípio orientador da mudança: **a estrutura da API do adotante não precisa mudar** — só precisa ser uma API REST convencional, por módulo de entidade, com um pull incremental básico. Quem já tem `POST /users` retornando o `User` criado já está a um passo de ser compatível.

O que se perde: o request/response deixa de ser livremente configurável por JSONPath. O que se ganha: zero configuração de formato de payload — request/response são sempre a entidade (ou array de entidades) pura, mapeamento 1:1 com as colunas do schema.

---

# O contrato REST

Por módulo de entidade (schema), com um `basePath` (ex: `/users`):

| Ação | Rota | Resposta | Quem chama |
|---|---|---|---|
| Listar (pull inicial ou incremental) | `GET /<base>?<listQueryTemplate renderizado>` | `Entity[]` — array puro | `SyncOrchestrator` (loop de pull) |
| Buscar um | `GET /<base>/:id` | `Entity`, ou `404` | não usado pelo motor de sync — só faz parte do contrato REST convencional que o backend expõe |
| Criar | `POST /<base>` | `201` + `Entity` criada | `SyncOrchestrator` (drenagem da fila, `operation: "insert"`) |
| Atualizar | `PATCH /<base>/:id` | `200` + `Entity` atualizada, ou `404` | idem, `operation: "update"` |
| Deletar | `DELETE /<base>/:id` | `204`, ou `404` | idem, `operation: "delete"` |

**Tombstone**: uma linha deletada aparece na listagem como `{ id, deletedAt }` mínimo — sem os outros campos. Discriminador: `deletedAt` não-nulo (toda linha viva também carrega `deletedAt: null`).

**Paginação**: sem envelope, sem `hasMore`. Menos itens que `{limit}` = última página. Ordenado por `(updatedAt ASC, id ASC)`.

**Cursor**: epoch millis, número puro — mesma convenção de `updatedAt`/`datetime` já usada no resto do projeto (`mvp-scope.md`). Avançado com `row.deletedAt ?? row.updatedAt` da última linha da página.

**Sem `localId` em lugar nenhum do contrato.** Cada push agora é sua própria chamada HTTP — a correlação request→resposta é implícita (o motor já sabe qual `localId` originou aquela chamada específica antes mesmo de chamar), então não há nada pra ecoar de volta.

Detalhamento completo (incluindo por que cada decisão foi tomada assim, ex: por que tombstone é list-only, por que double-delete é `404` de verdade) está no [README de `packages/salve-db-server`](../packages/salve-db-server/README.md#the-contract) — não duplicado aqui pra evitar as duas fontes divergirem.

---

# Contrato declarativo — o que muda em `SyncDefinition`

O sistema de JSONPath/`$ref` configurável (`RequestDefinition`, `ResponseDefinition`, `RequestExpression`, `VariableExpression`, `JsonPath` — hoje em `architecture.md`) **deixa de existir** para o protocolo REST. Request/response são sempre a entidade pura — não há formato pra configurar.

```ts
export interface SyncDefinition<TEntity> {

    enabled: boolean;

    direction: SyncDirection;      // sem mudança — "bidirectional" único no MVP

    conflict: ConflictStrategy;    // sem mudança — "lastWriteWins" único no MVP

    transport: "rest";             // sem mudança

    endpoint: EndpointDefinition;

    background?: BackgroundDefinition;   // sem mudança

    pagination?: PaginationDefinition;

}
```

Note que `strategy: SyncStrategy` (`"operations"`) some — não faz mais sentido como conceito: não existe mais um "lote de operações" trafegando como payload, o motor sempre fala REST convencional. `request`/`response` (as duas interfaces JSONPath-configuráveis) também somem inteiramente.

```ts
// EndpointDefinition — atualizado pelo #115: sinceParam/limitParam saíram,
// entraram itemPathTemplate (opcional)/listQueryTemplate (obrigatório).
export interface EndpointDefinition {

    /**
     * Caminho base do módulo REST da entidade, ex: "/users". As cinco rotas
     * do contrato (GET lista, GET um, POST, PATCH, DELETE) são sempre
     * relativas a isso por padrão — `itemPathTemplate` pode sobrescrever
     * o formato do path de item.
     */
    basePath: string;

    /**
     * Template `{token}` (não RFC 6570) do path de item, usado em
     * PATCH/DELETE. Tokens: `{basePath}`, `{id}`. Default quando ausente:
     * `"{basePath}/{id}"` — idêntico ao comportamento anterior ao #115.
     */
    itemPathTemplate?: string;

    /**
     * Template `{token}` da query string do pull, ex.
     * `"updatedAfter={since}&limit={limit}"`. Tokens: `{since}`, `{limit}`,
     * `{cursorField}`. Obrigatório — substitui `sinceParam`/`limitParam`
     * (removidos, mudança breaking do #115): não há mais forma fixa de
     * dois pares soltos, o autor do schema escreve a query inteira.
     */
    listQueryTemplate: string;

    headers?: Record<string, string>;

}
```

```ts
export interface PaginationDefinition {

    /**
     * Valor renderizado em `listQueryTemplate`'s `{limit}` quando o motor
     * pede uma página de pull. Continua controlando só o pull — o push não
     * tem mais conceito de "página batchada", cada item da fila é sua
     * própria chamada.
     */
    pageSize: number;

    /** Sem mudança de semântica — ver "Sessão de sync" abaixo. @default 20 */
    maxPagesPerSession?: number;

}
```

`AuthenticationDefinition`, `CredentialsDefinition`, `BackgroundDefinition`/`BackgroundParams`, `SyncOperation`, `NativeSyncResult` — sem mudança, continuam exatamente como em `architecture.md`. `Retry` continua fixo/global/hardcoded no engine (não um contrato por-schema), só que a granularidade de aplicação muda (ver abaixo).

---

# Sessão de sync — o algoritmo do motor

Estruturalmente diferente do modelo antigo: push e pull deixam de ser a mesma requisição. Uma sessão de `triggerSync(schemaName)` faz duas fases, nessa ordem:

```text
FASE 1 — Push (drena a sync_queue inteira, sequencial)
│
├─ Lê a fila em ordem (FIFO)
│
├─ Pra cada item:
│    insert → POST  <base>            update → PATCH <base>/:id
│    delete → DELETE <base>/:id
│
├─ Sucesso (2xx)?
│    ├─ insert/update: resposta = Entity → Replace Transaction
│    │    (localiza a linha por localId — já conhecido, não vem da resposta —
│    │    reescreve entityId = response.id, cascade rewrite em FKs filhas,
│    │    marca metadata SYNCED)
│    └─ delete (204): marca metadata SYNCED (soft-delete confirmado)
│
├─ Falha HTTP (400/404/409/500 — servidor respondeu)?
│    └─ marca esse item FAILED (retryCount++, lastError), remove da fila
│       de pendências ativas, segue pro próximo item
│
└─ Falha de REDE (sem conexão, timeout de conexão)?
     └─ aborta o resto da FASE 1 imediatamente — não adianta tentar os
        próximos itens contra um servidor inalcançável. Itens não
        processados continuam PENDING, tentados de novo na próxima sessão.

FASE 2 — Pull (loop de páginas, só roda se a FASE 1 não abortou por rede)
│
├─ GET <base>?<listQueryTemplate renderizado>
│
├─ Pra cada linha da resposta:
│    deletedAt != null?  → soft-delete local (tombstone)
│    já existe localmente (por id)?  → update, lastWriteWins por updatedAt
│    senão  → insert, marca metadata SYNCED com entityId=remoteId=id
│
├─ Avança cursor = deletedAt ?? updatedAt da última linha da página
│
└─ página veio cheia (== pageSize) && páginas < maxPagesPerSession?
     ├─ sim → repete FASE 2
     └─ não → encerra sessão (retoma do cursor persistido na próxima)
```

## Por que push antes de pull

Suas próprias mudanças locais são enviadas antes de perguntar "o que mudou desde X" — não é estritamente necessário (aplicar sua própria linha de novo via pull é um no-op idempotente), mas é a ordem mais intuitiva e evita uma janela onde o pull traria de volta um estado que o push está prestes a substituir.

## Cada chamada HTTP individual tem seu próprio orçamento de retry

3 tentativas, 5s de delay entre elas — mesma constante hardcoded de hoje (`architecture.md`, seção "Retry"), só que agora aplicada por chamada (`POST`/`PATCH`/`DELETE`/`GET` de página), não por request de página batchada. Uma falha de **rede** (não uma resposta HTTP de erro) já esgota o próprio orçamento de retry daquela chamada antes de decidir abortar a fase — a distinção push-por-item-FAILED vs. abort-de-fase é sobre o que fazer **depois** do orçamento de retry de uma chamada se esgotar, não sobre pular o retry.

## Retry de itens FAILED

Toda sessão de sync tenta de novo qualquer item `PENDING` **ou** `FAILED` da fila — sem necessidade de o usuário editar a linha de novo pra "reativar" a tentativa. Uma falha transitória (rede caiu, servidor fora do ar por 1 minuto) se resolve sozinha na próxima sessão. Um erro persistente (ex: 400 de validação) vai continuar sendo tentado (e falhando) a cada sessão — não há backoff exponencial nem limite de tentativas totais no MVP; é o mesmo território de "retry policy por schema" já listado como fora do MVP em `architecture.md`.

## Conflito no push

Sem tratamento especial. O contrato REST não define semântica de `409`/conflito otimista — se o servidor rejeitar um `PATCH`, cai no tratamento genérico de falha HTTP (`FAILED`, retry na próxima sessão). Conflito otimista com `version`/ETag já está registrado como fora do MVP na epic #74 e continua assim.

---

# Onde a `_salve_sync_metadata` entra

**O schema da tabela não muda** — `tableName`, `localId`, `entityId`, `remoteId`, `operation`, `status`, `retryCount`, `lastError`, `version`, `createdAt`, `updatedAt`, `syncedAt` continuam exatamente como estão (`SalveMetadataManager.hpp`). O que muda é **como o C++ a preenche**:

- **Hoje**: `SyncOperationApplier::applyAck` itera um array `ack` extraído via JSONPath da resposta batchada.
- **Alvo**: depois de um `POST`/`PATCH` bem-sucedido, o `id` da linha vem direto do corpo da resposta (`response.body.id`) — o motor já sabe o `localId` (foi ele quem fez a chamada), então o "ack" vira só ler um campo da resposta e chamar a mesma lógica de Replace Transaction que já existe hoje (localizar por `localId`, reescrever `entityId`, `RelationCascadeRewriter`, marcar `SYNCED`) — sem precisar de um array, sem loop.
- **Pull**: linhas puxadas via `GET` precisam passar a marcar metadata `SYNCED` (com `remoteId = entityId = id`), o que **hoje não acontece** — `SyncOperationApplier::apply()` (caminho de pull) nunca chamou `SalveMetadataManager`. Esse é um gap real, já identificado numa sessão anterior de trabalho (issue #78, pausada): sem isso, uma linha vinda do servidor fica sem metadata até a primeira edição local, o que deixa `remoteId` nulo e `status` incorreto num estado que já está sincronizado. A correção (`SalveMetadataManager::markPulledSynced`, conflitando por `entityId` em vez de `localId`) precisa entrar junto da reescrita do motor de push/pull, não depois.

---

# O que já reaproveita sem mudança

- `lastWriteWins` via comparação de `updatedAt` — a lógica de `SyncOperationApplier::apply()` que decide `INSERT` vs `UPDATE` olhando se já existe localidade já faz exatamente a inferência que o pull sem campo `operation` precisa (nunca dependeu desse campo pra decidir insert/update, só pra decidir delete).
- `RelationCascadeRewriter` — cascade rewrite de FK ao reescrever `entityId`, sem mudança.
- `CredentialProvider`/refresh em 401 — transporte, ortogonal ao formato do payload.
- `_sync_apply_lock` / bypass de trigger durante apply — sem mudança.
- O scheduler de background nativo (`platform::scheduleBackgroundSync`) e o gatilho de app-open (`registerAppOpenSync`) — dispersam sessões de `triggerSync`/`triggerSyncAll`, não sabem nem precisam saber qual protocolo de wire está por baixo.
- Leitura-dispara-sync (issue #78, pausada nesta sessão pra essa discussão de protocolo) — o conceito (uma leitura local pode cutucar uma sessão de sync em background, com `discardIfBusy`) é ortogonal ao formato do payload. Retoma depois que o motor falar o novo protocolo.

# O que fica removido/sem uso

- `RequestExpressionEvaluator` (`cpp/expression/`) — único consumidor era `SyncOrchestrator`. Sem uso sob o novo contrato, remove por completo (arquivo + teste).
- **`JsonPathExtractor` (`cpp/expression/`) NÃO é removível** — `CredentialProvider::refresh()` também o usa pra extrair `accessToken`/`refreshToken` da resposta do refresh OAuth2 (`cpp/credentials/CredentialProvider.cpp:68,75`), que não muda. Só o uso dele dentro de `SyncOrchestrator.cpp` desaparece; a classe e `cpp/tests/expression/JsonPathExtractorTests.cpp` continuam.
- `SyncHttpCaller`'s construção de corpo de request via `RequestDefinition` — vira montagem direta do JSON da entidade (sem `$ref`).
- `IRequestDefinition`, `IResponseDefinition`, `RequestExpression` (+ `IVariableExpression`/`IConstantExpression`/`IObjectExpression`/`IArrayExpression`, todas no mesmo arquivo), `SyncStrategy`, `HttpMethod`, `IAuthenticationDefinition`, `AuthStrategy` (`src/types/sync/`) — tipos TS correspondentes, todos verificados sem uso fora do próprio grafo do contrato antigo. **`JsonPath` (`src/types/JsonPath.ts`) NÃO é removível** — mesma razão do `JsonPathExtractor`, usado por `ICredentialsDefinition.refresh.response`.
- `ack`/`IResponseDefinition.ack` (introduzido na #77) — o conceito de "lista de ack" desaparece; cada resposta de `POST`/`PATCH` já É o ack de uma linha só.

---

# O que precisa ser alterado, arquivo por arquivo

## Contrato declarativo (TS) — `src/types/sync/`

**Deletar** (confirmado sem uso fora do próprio grafo do contrato antigo):
`IRequestDefinition.ts`, `IResponseDefinition.ts`, `RequestExpression.ts`, `SyncStrategy.ts`, `HttpMethod.ts`, `IAuthenticationDefinition.ts`, `AuthStrategy.ts` — e remover os 7 `export type *` correspondentes de `src/types/sync/index.ts`.

**Modificar:**

```ts
// ISyncDefinition.ts — remove strategy, request, response; sem mudança no resto
export interface ISyncDefinition<TEntity> {
  enabled: boolean;
  direction: SyncDirection;
  conflict: ConflictStrategy;
  transport: Transport;
  endpoint: IEndpointDefinition;
  background?: IBackgroundDefinition;
  pagination?: IPaginationDefinition;
}
```

```ts
// IEndpointDefinition.ts — method/path/authentication saem, entram
// basePath/itemPathTemplate/listQueryTemplate (nomes atualizados pelo #115,
// que removeu sinceParam/limitParam em favor de listQueryTemplate)
export interface IEndpointDefinition {
  basePath: string;
  itemPathTemplate?: string;
  listQueryTemplate: string;
  headers?: Record<string, string>;
}
```

`IPaginationDefinition.pageSize` — o comentário atual ("usado tanto no pull quanto pra limitar o lote de push") fica incorreto — passa a valer só pro pull (renderizado em `listQueryTemplate`'s `{limit}`). Atualizar o JSDoc.

**Sem mudança:** `JsonPath.ts`, `ICredentialsDefinition.ts`, `IBackgroundDefinition.ts`, `ConflictStrategy.ts`, `SyncDirection.ts`, `ITransport.ts`, `ISyncOperation.ts`, `NativeSyncResult.ts`, `SyncMetadataStatus.ts`.

## Motor nativo (C++) — `cpp/`

```cpp
// cpp/http/SyncHttpCaller.hpp — hoje é um send() genérico(endpoint, body) que
// serializa method/path arbitrários do EndpointDefinition antigo. Precisa virar
// pelo menos 4 construtores de chamada, um por verbo REST do contrato:
static SyncHttpOutcome list(const std::string& basePath, const UrlTemplate& listQueryTemplate,
                             double since, double limit,
                             const AuthHeader&, const NetworkConfig&);
static SyncHttpOutcome create(const std::string& basePath, const json::Value& body, ...);
static SyncHttpOutcome update(const std::string& basePath, const std::string& id, const json::Value& body, ...);
static SyncHttpOutcome remove(const std::string& basePath, const std::string& id, ...);
```

```cpp
// cpp/sync/SyncOperationApplier.hpp
// apply() é reaproveitado, mas precisa de duas mudanças:
//  1. reconhecer deletedAt != null numa linha como tombstone (soft-delete
//     local) em vez de depender de um campo `operation` explícito — a
//     inferência insert-vs-update por "já existe localmente?" já existe e
//     não muda.
//  2. chamar SalveMetadataManager::upsert(status=SYNCED, remoteId=entityId=id)
//     pra cada linha inserida/atualizada via pull — hoje apply() nunca toca
//     _salve_sync_metadata, só applyAck() toca. Sem isso, uma linha vinda do
//     servidor fica sem metadata até a primeira edição local (remoteId nulo,
//     status incorreto num estado que já está sincronizado).
//
// applyAck() é REMOVIDO — array de ack não existe mais. Substituído por algo
// bem menor, processando UMA resposta de POST/PATCH por vez:
ApplyStats applyReplace(const std::string& expectedEntity, const std::string& localId, const json::Value& responseBody);
```

```cpp
// cpp/sync/SyncOrchestrator.cpp — runSyncSession reescrito nas duas fases
// descritas em "Sessão de sync" acima. kMaxAttempts/kRetryDelay (3/5000ms,
// hoje constantes anônimas no topo do arquivo) não mudam de valor, só de
// onde são aplicadas (por chamada HTTP individual, não por página).
```

```cpp
// cpp/sync/SyncQueueReader.hpp — readPage()/readOperations() continuam
// lendo a fila em ordem; o que muda é o consumidor (SyncOrchestrator não
// batcha mais N linhas num corpo só). Decisão em aberto pra quem implementar:
// a fase de push precisa de um teto análogo a maxPagesPerSession (ex:
// maxPushItemsPerSession), pra não deixar uma fila gigante monopolizar uma
// sessão inteira? Este doc não fecha essa resposta — avaliar ao implementar.
```

```cpp
// cpp/sync/SyncCursorStore.hpp — load()/save() continuam string-based
// (armazenam o texto do cursor); o que muda é o CONTEÚDO — antes um valor
// opaco vindo do servidor, agora sempre o texto de um número epoch millis.
// Ver "Migração de estado persistido" abaixo pra cursores já salvos no
// formato antigo.
```

**Deletar:** `cpp/expression/RequestExpressionEvaluator.hpp/.cpp` + `cpp/tests/expression/RequestExpressionEvaluatorTests.cpp`.

**Reescrever (não deletar — os fixtures usam o schema JSON e a resposta HTTP no formato antigo):** `cpp/tests/sync/SyncOrchestratorTests.cpp`, `SyncOperationApplierTests.cpp`, `SyncQueueReaderTests.cpp`.

**`MigrationEngine::parseSchemaJson`** (`cpp/database/MigrationEngine.cpp`) e **`SyncDefinitionStore`** (`cpp/sync/SyncDefinitionStore.cpp`) — precisam parsear o novo formato reduzido de `sync` (sem `request`/`response`/`strategy`).

## Migração de estado persistido

Duas tabelas de sistema guardam estado no formato antigo, que precisa ser tratado na primeira sessão de sync depois que o app atualizar pro motor novo:

- **`_salve_sync_definitions`** — guarda o JSON do contrato de sync por schema. Como `Database.register()` já roda a cada abertura do app (não só uma vez), o registro reescreve essa linha com o schema JS atual — que já vai estar no formato novo assim que o app for atualizado. Não precisa de migração explícita, só confirmar que `SyncDefinitionStore` faz `INSERT OR REPLACE`/upsert (não `INSERT OR IGNORE`) ao registrar.
- **`_salve_sync_cursors`** — guarda um valor de cursor opaco vindo do servidor antigo (ex: `"\"c12345\""`, string JSON-encoded). Esse valor não tem conversão válida pro novo formato (epoch millis numérico) — são semânticas diferentes, não um simples reparse. Comportamento pretendido: ao registrar um schema pela primeira vez sob o motor novo, **resetar o cursor daquele schema** (tratar como se nunca tivesse sincronizado) — dispara um pull incremental completo desde `since=0` uma única vez. Mais simples e mais seguro que tentar interpretar um cursor de formato desconhecido.

## `example/` app

Migrado: `example/mock-sync-server/` (protocolo batchado antigo) e os 3 schemas de teste antigos (`SyncTestItemSchema`/`NoteSchema`/`TagSchema`, formato `endpoint.method/path` + `request`/`response`) foram removidos — não coexistem com o motor novo. `example/src/schemas/{UserSchema,ProductSchema}.ts` espelham `IUser`/`IProduct` de `packages/salve-db-server` e sincronizam contra os módulos `/users`/`/products` reais de lá (`listQueryTemplate` com nomes de query param diferentes por schema — `updatedAfter`/`limit` vs. `modified_since`/`page_size` — provando que a config é por-módulo, atualizado pelo #115). `SyncTestScreen.tsx` foi reescrita: composer local (insert/edit/delete → POST/PATCH/DELETE), botão "Write directly on server" (POST direto no REST, sem passar pelo SQLite — substitui o antigo `POST /admin/seed`, rota que nunca existiu no `salve-db…

---

# Exemplo completo

```ts
export const CustomerSchema = {

    name: "customers",

    version: 1,

    primaryKey: "id",

    columns: {
        id: { type: "text" },
        name: { type: "text" },
        phone: { type: "text" },
    },

    sync: {

        enabled: true,

        direction: "bidirectional",

        conflict: "lastWriteWins",

        transport: "rest",

        endpoint: {
            basePath: "/customers",
            listQueryTemplate: "updatedAfter={since}&limit={limit}",
        },

        background: {
            enabled: true,
        },

        pagination: {
            pageSize: 200,
            maxPagesPerSession: 20,
        },

    },

} satisfies SchemaDefinition<Customer>;
```

Comparado ao exemplo equivalente em `architecture.md`: sem `request.body` com `$ref`, sem `response` com `JsonPath` — `endpoint` ganhou `listQueryTemplate`/`itemPathTemplate` (nomes atualizados pelo #115), perdeu `method`.

---

# Fora de escopo (sem mudança em relação a `architecture.md`)

- Conflito otimista via `version`/ETag.
- Retry policy por schema (continua fixo/global/hardcoded).
- `direction` além de `"bidirectional"` (push-only/pull-only).
- Compression, Encryption, Batch Sync, Sync Dependencies, Multi-tenant Sync, WebSocket Sync, Custom Sync Protocol (além de REST) — mesma lista de `architecture.md`, sem mudança.
- Semântica de `409`/conflito de escrita no push (ver seção "Sessão de sync" acima).

# Decisões fechadas na implementação

A rodada de discussão original deixou algumas questões em aberto "avaliar ao implementar" — foram fechadas assim:

- **Falha de rede no push**: `runSyncSession` continua lançando exceção (não retorna resultado parcial) — preserva a rejeição de Promise em JS e mantém `NativeSyncResult` sem mudança de shape (sem ciclo de codegen Nitro nesta migração).
- **Coluna desconhecida na resposta do servidor** (pull ou replace): ignorada silenciosamente, com log por sessão — REST real carrega campos extras (`createdAt`, `__v`, etc.) que o schema local não declara.
- **Status de delete confirmado**: fica `DELETED` + `syncedAt` preenchido — é o que o motor usa pra escolher o verbo HTTP (`DELETE` vs. `PATCH`) e o que a marcação de falha precisa preservar.
- **Corpo de `POST`/`PATCH`**: colunas declaradas do schema, menos `{primaryKey, deletedAt}` — o id vai na rota, o delete é expresso pelo verbo.
- **`maxPushItemsPerSession`**: existe, como constante fixa do motor (`kMaxPushItemsPerSession = 200`), não como campo do contrato declarativo — a migração está encolhendo o contrato, não expandindo.
- **Precisão do cursor de pull**: persiste `últimoTs - 1` (não o timestamp exato) — evita perder linhas que caem no mesmo milissegundo na fronteira de uma página; custo é reentrega idempotente de ~1ms via lastWriteWins.
- **Migração do cursor pré-#84**: detectada por um carimbo de versão de motor global em `_salve_schema_versions` (não por tentar interpretar o valor antigo) — na primeira `registerSchema()` pós-upgrade, todo cursor persistido é descartado de uma vez, disparando um pull completo desde `since=0`.

# Rastreamento

Todo o trabalho descrito neste doc é rastreado na issue **#84** (motor nativo + contrato TS + migração de estado — concluído) e na issue **#85** (read-flow cache-first / gatilho de sync por leitura — concluído antes da #84, na mesma branch, e ortogonal ao protocolo de wire). `example/` completo + testes `react-native-harness` também estão concluídos.

A epic #74 e a issue #77 foram fechadas — o modelo de Replace Transaction via array `ack` que elas construíram foi substituído pelo mecanismo por-item deste doc. #75 e #76 continuam válidas e mergeadas (fundação de metadata e cascade de FK foram reaproveitadas sem mudança, ver "O que já reaproveita sem mudança" acima).

`docs/architecture.md`/`docs/mvp-scope.md` ainda precisam ser atualizados pra refletir o contrato novo como o estado real do motor (pendente); depois disso este doc pode ser arquivado/mesclado neles.
