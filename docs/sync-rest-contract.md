# Sync REST Contract (alvo — ainda não implementado no motor nativo)

> **Status:** este doc descreve o contrato de sync **alvo**, decidido nesta rodada de discussão, que vai **substituir** o contrato batchado hoje documentado em [`architecture.md`](./architecture.md) e nos trechos de sync de [`mvp-scope.md`](./mvp-scope.md). O motor nativo (`cpp/sync/`) ainda fala o protocolo antigo — a migração é um trabalho futuro separado, ainda não iniciado. Até lá, `architecture.md` continua sendo a fonte de verdade do que **está implementado hoje**; este doc é a fonte de verdade do que **vai substituir isso**.
>
> **Referência viva:** [`packages/salve-db-server`](../packages/salve-db-server) implementa exatamente este contrato — um backend REST de referência que qualquer adotante da lib pode ler como "essa é a forma que minha API precisa ter". O README de lá cobre o contrato do ponto de vista do backend; este doc cobre o mesmo contrato do ponto de vista do motor de sync nativo que vai consumi-lo.

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
| Listar (pull inicial ou incremental) | `GET /<base>?<sinceParam>=<epochMillis>&<limitParam>=<n>` | `Entity[]` — array puro | `SyncOrchestrator` (loop de pull) |
| Buscar um | `GET /<base>/:id` | `Entity`, ou `404` | não usado pelo motor de sync — só faz parte do contrato REST convencional que o backend expõe |
| Criar | `POST /<base>` | `201` + `Entity` criada | `SyncOrchestrator` (drenagem da fila, `operation: "insert"`) |
| Atualizar | `PATCH /<base>/:id` | `200` + `Entity` atualizada, ou `404` | idem, `operation: "update"` |
| Deletar | `DELETE /<base>/:id` | `204`, ou `404` | idem, `operation: "delete"` |

**Tombstone**: uma linha deletada aparece na listagem como `{ id, deletedAt }` mínimo — sem os outros campos. Discriminador: `deletedAt` não-nulo (toda linha viva também carrega `deletedAt: null`).

**Paginação**: sem envelope, sem `hasMore`. Menos itens que `<limitParam>` = última página. Ordenado por `(updatedAt ASC, id ASC)`.

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
export interface EndpointDefinition {

    /**
     * Caminho base do módulo REST da entidade, ex: "/users". As cinco rotas
     * do contrato (GET lista, GET um, POST, PATCH, DELETE) são sempre
     * relativas a isso — não há mais `method`/`path` configurável por
     * operação, porque os verbos HTTP já são fixos pelo contrato REST.
     */
    basePath: string;

    /**
     * Nomes dos query params do pull incremental. Configurável por schema
     * porque uma API já existente pode já ter uma convenção própria (ex:
     * "since" em vez de "updatedAfter") — o ponto central de minimizar o
     * que o adotante precisa mudar.
     */
    sinceParam: string;

    limitParam: string;

    headers?: Record<string, string>;

}
```

```ts
export interface PaginationDefinition {

    /**
     * Valor enviado em `<limitParam>` quando o motor pede uma página de
     * pull. Continua controlando só o pull — o push não tem mais conceito
     * de "página batchada", cada item da fila é sua própria chamada.
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
├─ GET <base>?<sinceParam>=<cursor>&<limitParam>=<pageSize>
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

- `RequestExpressionEvaluator`, `JsonPathExtractor` (`cpp/expression/`) — só existiam pra interpretar `$ref`/JSONPath do contrato antigo. Sem consumidor sob o novo contrato.
- `SyncHttpCaller`'s construção de corpo de request via `RequestDefinition` — vira montagem direta do JSON da entidade (sem `$ref`).
- `IRequestDefinition`, `IResponseDefinition`, `RequestExpression` e as variantes (`VariableExpression`, `ObjectExpression`, `ArrayExpression`), `JsonPath` (`src/types/sync/`) — tipos TS correspondentes, sem uso.
- `ack`/`IResponseDefinition.ack` (introduzido na #77) — o conceito de "lista de ack" desaparece; cada resposta de `POST`/`PATCH` já É o ack de uma linha só.

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
            sinceParam: "updatedAfter",
            limitParam: "limit",
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

Comparado ao exemplo equivalente em `architecture.md`: sem `request.body` com `$ref`, sem `response` com `JsonPath` — `endpoint` ganhou `sinceParam`/`limitParam`, perdeu `method`.

---

# Fora de escopo (sem mudança em relação a `architecture.md`)

- Conflito otimista via `version`/ETag.
- Retry policy por schema (continua fixo/global/hardcoded).
- `direction` além de `"bidirectional"` (push-only/pull-only).
- Compression, Encryption, Batch Sync, Sync Dependencies, Multi-tenant Sync, WebSocket Sync, Custom Sync Protocol (além de REST) — mesma lista de `architecture.md`, sem mudança.
- Semântica de `409`/conflito de escrita no push (ver seção "Sessão de sync" acima).

# Próximos passos (fora deste doc)

1. Reescrever `cpp/sync/SyncOrchestrator.cpp`/`SyncQueueReader.cpp`/`SyncOperationApplier.cpp`/`SyncHttpCaller.cpp` contra este contrato.
2. Corrigir o gap de metadata no pull (`markPulledSynced`) como parte da mesma reescrita, não depois.
3. Atualizar `docs/architecture.md`/`docs/mvp-scope.md` pra refletir o novo contrato como o estado real, e então este doc pode ser arquivado/mesclado.
4. Retomar a issue #78 (leitura-dispara-sync) sobre o motor já reescrito.
