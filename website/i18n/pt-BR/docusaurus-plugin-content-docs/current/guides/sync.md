---
title: Sincronização
---

A sincronização é declarada por schema como dados (`ISyncDefinition`), interpretada inteiramente pelo
engine nativo. Não existe loop de sync em JS — `Database.sync()`/`Database.syncAll()` apenas pedem ao
orquestrador nativo para rodar uma sessão; o mesmo orquestrador é acordado diretamente pelo código
nativo na abertura do app e em background (veja [Background Sync](../guides/background-sync.md)).

## `ISyncDefinition`

```ts
interface ISyncDefinition {
  enabled: boolean;
  direction: SyncDirection;       // MVP: "bidirectional" only
  conflict: ConflictConfig;
  transport: Transport;           // MVP: "rest" only
  endpoint: IEndpointDefinition;
  background?: IBackgroundDefinition;
  pagination?: IPaginationDefinition;
}
```

- **`enabled`** — controla se esse schema participa da sincronização: `Database.sync()` manual,
  `syncOnAppOpen` e o wake em background todos ignoram um schema com `enabled: false`.
- **`direction`** — apenas `"bidirectional"` está implementado no MVP.
- **`conflict`** — como uma linha vinda do servidor é reconciliada com uma linha local existente. Veja
  [Estratégias de conflito](#estratégias-de-conflito) abaixo.
- **`transport`** — apenas `"rest"` está implementado no MVP.
- **`endpoint`** — o contrato do módulo REST para essa entidade (base path, templates de path/query,
  campo de cursor, headers extras). Veja [`IEndpointDefinition`](#iendpointdefinition).
- **`background`** — `{ enabled: boolean }`, pensado para controlar se esse schema participa do wake
  em background. Ainda não é consultado nativamente: a contraparte de background de
  `Database.syncAll()` (`triggerSyncAll`) atualmente roda todo schema com `sync.enabled`
  independentemente dessa flag. O agendamento global de background (intervalo, requisitos de
  rede/carregamento) é configurado uma única vez via `Database.configure({ background })` — veja
  [Background Sync](../guides/background-sync.md).
- **`pagination`** — tamanho da página de pull e limite de páginas por sessão. Opcional; recorre aos
  valores padrão do próprio engine quando omitido.

```ts
sync: {
  enabled: true,
  direction: 'bidirectional',
  conflict: { strategy: 'lastWriteWins' },
  transport: 'rest',
  endpoint: {
    basePath: '/users',
    listQueryTemplate: 'updatedAfter={since}&limit={limit}',
  },
  pagination: { pageSize: 50, maxPagesPerSession: 20 },
}
```

## `IEndpointDefinition`

```ts
interface IEndpointDefinition {
  basePath: string;
  itemPathTemplate?: string;      // default: "{basePath}/{id}"
  listQueryTemplate: string;
  cursorField?: string;           // default: "updatedAt"
  headers?: Record<string, string>;
}
```

- **`basePath`** — path base do módulo REST da entidade, ex.: `/users`. Toda rota que o engine chama é
  relativa a ele: `GET <basePath>` (list), `POST <basePath>` (create) e — por padrão —
  `PATCH`/`DELETE <basePath>/:id` (update/delete).
- **`itemPathTemplate`** — template para a rota de item único usada por `PATCH`/`DELETE`, ex.:
  `"{basePath}({id})"` para uma API estilo OData. Tokens: `{basePath}`, `{id}` (`{id}` sempre é
  percent-encoded; `{basePath}` é inserido cru). Padrão: `"{basePath}/{id}"`.
- **`listQueryTemplate`** — template para a query string do pull, ex.:
  `"updatedAfter={since}&limit={limit}"`, ou um filtro composto como
  `"$filter={cursorField} gt {since}&$top={limit}"`. Tokens: `{since}`, `{limit}`, `{cursorField}`
  (todos percent-encoded). Obrigatório — não há fallback; cada schema declara explicitamente o
  formato da sua própria query. Este é um vocabulário fechado de `{token}`, deliberadamente não
  RFC 6570.
- **`cursorField`** — o nome do campo (no JSON de cada linha puxada) que carrega o timestamp daquela
  linha, lido da última linha de uma página para avançar o cursor de pull incremental. Obrigatório
  independentemente de `sync.conflict.strategy` — a paginação precisa dele independente de como os
  conflitos são resolvidos. Padrão: `"updatedAt"`.
- **`headers`** — headers extras mesclados em toda requisição dessa entidade.

## `IPaginationDefinition`

```ts
interface IPaginationDefinition {
  pageSize: number;
  maxPagesPerSession?: number;    // default: 20
}
```

- **`pageSize`** — itens por página de pull, renderizado no token `{limit}` do `listQueryTemplate`. O
  push não tem conceito de batching — cada item enfileirado é sua própria chamada HTTP,
  independentemente desse valor.
- **`maxPagesPerSession`** — máximo de páginas de pull por sessão de sync (mesma janela de
  conectividade). Evita que um loop longo drene a bateria em um único wake do scheduler. Quando o
  limite é atingido com uma página ainda cheia, o engine para e retoma a partir do cursor já
  avançado no próximo wake. Padrão: `20`.

## Estratégias de conflito

`conflict` é uma união discriminada por `strategy`:

- **`lastWriteWins`** (a mais comum) — qual lado tiver o valor mais recente em uma coluna de
  timestamp configurável vence.

  ```ts
  conflict: { strategy: 'lastWriteWins', field: 'updatedAt' } // field is optional, defaults to "updatedAt"
  ```

  `field` nomeia uma coluna declarada nas próprias `columns` do schema (e presente no payload da
  API). Configurável para que a convenção de nomenclatura de uma API possa ser usada em vez de
  forçar `updatedAt`. Precisa referenciar uma coluna declarada como
  `{ type: "datetime", nullable: false }` — `Database.register()` lança um erro no momento do
  registro se não for o caso, já que uma coluna nullable ou que não seja datetime não pode ser
  comparada como timestamp.

- **`serverWins`** — a linha vinda do servidor sempre sobrescreve a linha local, independentemente de
  qualquer edição local.

  ```ts
  conflict: { strategy: 'serverWins' }
  ```

- **`clientWins`** — uma linha local existente nunca é sobrescrita por uma linha vinda do servidor;
  uma linha que ainda não existe localmente é inserida mesmo assim.

  ```ts
  conflict: { strategy: 'clientWins' }
  ```

- **`manual`** não está implementado no MVP.

Nota: a estratégia de `conflict` não tem relação com `endpoint.cursorField` — o campo de cursor
sempre é obrigatório para a paginação incremental, independentemente de qual estratégia de conflito
é escolhida.

## O algoritmo da sessão de sync

Uma sessão de `triggerSync(schemaName)` (invocada por `Database.sync()`, `Database.syncAll()`,
`syncOnAppOpen`, ou pelo wake em background) roda duas fases, em ordem. Detalhes completos, incluindo
semântica de retry e tombstone, estão em
[`docs/sync-rest-contract.md`](https://github.com/Salve-Software/react-native-salve-db/blob/main/docs/sync-rest-contract.md)
no GitHub.

```text
PHASE 1 — Push (drains the whole sync_queue, sequentially, FIFO)
│
├─ insert → POST <basePath>     update → PATCH <basePath>/:id     delete → DELETE <basePath>/:id
│
├─ 2xx? → insert/update: response Entity replaces the row (rewrites entityId, cascades FK
│         children, marks metadata SYNCED); delete (204): marks metadata SYNCED
├─ HTTP failure (400/404/409/500)? → item marked FAILED (retryCount++), moves to the next item
└─ network failure? → aborts the rest of PHASE 1 immediately; unprocessed items stay PENDING and
     are retried next session

PHASE 2 — Pull (loop of pages; only runs if PHASE 1 did not abort on a network failure)
│
├─ GET <basePath>?<listQueryTemplate rendered>
├─ each row: deletedAt != null → local tombstone; exists locally → update (lastWriteWins by
│   updatedAt, or per the configured conflict strategy); else → insert
├─ advance cursor = deletedAt ?? updatedAt of the last row in the page
└─ page came back full (== pageSize) && pages < maxPagesPerSession?
     ├─ yes → repeat PHASE 2
     └─ no → end session (resumes from the persisted cursor next time)
```

O push roda antes do pull: suas próprias alterações locais são enviadas antes de perguntar "o que
mudou desde X" — não é estritamente necessário (reaplicar sua própria linha via pull é um no-op
idempotente), mas é a ordem mais intuitiva e evita uma janela em que um pull poderia trazer de volta
um estado que o push está prestes a substituir.

Toda chamada HTTP (página de `POST`/`PATCH`/`DELETE`/`GET`) tem seu próprio orçamento de retry: 3
tentativas, 5s de intervalo, fixo no engine nativo — não configurável por schema. Toda sessão tenta
novamente qualquer item da fila `PENDING` ou `FAILED`, então uma falha transitória se resolve sozinha
na próxima sessão sem qualquer ação do usuário.

## Disparando a sincronização a partir do JS

```ts
await Database.sync('users');   // one schema
await Database.syncAll();       // every sync-enabled schema
```

A sincronização também roda automaticamente:

- **Na abertura do app** — controlado por `Database.configure({ syncOnAppOpen })`, que tem padrão
  `true`. Defina como `false` para desativar a sincronização automática quando o app volta ao
  primeiro plano.
- **Em background** — veja [Background Sync](../guides/background-sync.md) para o scheduler nativo,
  suas opções em `Database.configure({ background })`, e os pisos de cada plataforma.

A autenticação de toda requisição de sincronização é tratada pelo bloco de credenciais configurado
uma única vez via `Database.configure` — veja [Credenciais OAuth2](../guides/credentials-oauth2.md).
