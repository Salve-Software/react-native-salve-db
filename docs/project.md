# Salve DB — Native Offline Database

> Doc central do projeto. Apresenta a ideia geral e **só a superfície do MVP** — sem os marcadores de "reservado pro futuro" que aparecem em `architecture.md`. Pra decisões e trade-offs por trás de cada escolha, ver [`mvp-scope.md`](./mvp-scope.md). Pra visão de longo prazo e contratos completos (superset), ver [`overview.md`](./overview.md) e [`architecture.md`](./architecture.md). Pro contrato da camada de query/ORM, ver [`query-layer.md`](./query-layer.md).

---

## O que é

Um banco SQLite para React Native com uma característica central: **offline-first de verdade**. A maior parte do trabalho — persistência, rastreio de mudanças, fila de sincronização, autenticação, agendamento em background — roda na camada nativa (Swift/Kotlin), não em JavaScript.

Isso resolve um problema comum em libs offline-first pra RN: sincronização em background que depende de subir a JS engine consome bateria, tem latência de inicialização e trava se o processo JS morrer. Aqui, o motor de sync nativo funciona sozinho — a camada JS só declara **o quê** sincronizar e **como**, nunca participa da execução.

O app declara schemas em TypeScript (tabelas, colunas, contrato de sync). O Native Sync Engine lê essa declaração e executa tudo: abrir o banco, rodar migrations, disparar sync, renovar token, agendar background.

---

## Arquitetura

```text
React Native (camada de declaração)
│
▼
Database.configure()   → credenciais, baseUrl, timeout
Database.register()    → schemas
│
▼
Native Layer (Swift/Kotlin)
├── SQLite
├── Trigger Engine
├── Sync Queue
├── Query Executor (JSI)     ← recebe SQL+params do builder JS, executa, cacheia prepared statements
├── HTTP Client
├── Credential Provider
├── Background Scheduler
└── Migration Engine
```

A camada JS declara config/schemas e monta queries (builder tipo Drizzle) — mas quem executa é sempre o nativo. Sync em background acontece inteiramente sem JS; query em foreground usa JS pra montar a query, não pra executá-la.

---

## Como funciona, peça por peça

### Schema

Cada entidade é declarada uma vez: nome da tabela, colunas, índices e (opcionalmente) contrato de sync.

```ts
Database.register({ schema: CustomerSchema })
```

### Trigger Engine

Toda alteração local (INSERT/UPDATE/DELETE) numa tabela sincronizável gera automaticamente uma operação na `sync_queue`, via trigger SQLite nativa. Nenhum repositório ou tela precisa lembrar de "adicionar à fila" — é impossível esquecer, porque não é uma chamada de código, é uma trigger de banco.

### Sync Queue

Fila persistida no próprio SQLite. Cada linha é uma operação pendente:

| operation | entity | id | payload |
|---|---|---|---|
| INSERT | customer | 10 | `{...}` |

### Migration Engine

Ao abrir o banco, o engine compara a `version` declarada no schema com a versão persistida e aplica `ALTER TABLE ADD COLUMN` automaticamente pras colunas novas. Não existem scripts de migration escritos à mão no MVP.

Coluna removida do schema TS **não é dropada** — fica órfã no SQLite, sem uso. `DROP COLUMN`/`RENAME` são operações destrutivas e caras no SQLite, então ficam fora do MVP por design, não por esquecimento.

### Native Sync Engine — fluxo de uma sincronização

Disparado por: abertura do app, mudança de conectividade, chamada manual, ou wake do scheduler de background.

```text
Ler sync_queue (até pageSize)
│
▼
Enviar página ao servidor
│
▼
Aplicar transação SQLite
│
▼
Atualizar cursor
│
▼
hasMore && páginas < maxPagesPerSession?
├── sim → repete (próxima página, mesma sessão)
└── não → limpa fila processada, encerra sessão
```

O loop de páginas existe porque, sem ele, a primeira sync de um dataset grande (ou uma fila de push grande) viraria um único request/response sem limite — problema real de escala, não só um "e se".

---

## Camada de Query (ORM)

Até aqui, tudo descreve *sincronização*. Mas o app precisa ler e escrever dado local — e é aí que entra uma camada de query inspirada no **Drizzle**: type-safe, com builder fluente, sem função mágica escondida.

Diferença importante de tudo que veio antes: a camada de query roda em **foreground**, com JS já de pé (o usuário abriu uma tela e chamou `db.select()`). A regra "sem JS" do projeto é sobre o *sync engine* rodando sem supervisão em background — não se aplica aqui. Isso libera a camada de query pra ser JS-side, do jeito que o Drizzle é: o builder monta SQL parametrizado em TypeScript e manda executar no nativo via JSI, que mantém um cache de prepared statements. É mais rápido do que parece contra-intuitivo: o gargalo de uma query é sempre I/O do SQLite, não a montagem da string.

```ts
const activeCustomers = await db
  .select(CustomerSchema)
  .where(eq(CustomerSchema.columns.active, true))
  .orderBy("name")
  .limit(50)
  .execute();

await db.transaction(async (tx) => {
  await tx.insert(OrderSchema).values({ id, customerId, total }).execute();
  await tx.insert(OrderItemSchema).values({ orderId: id, sku, qty }).execute();
});
```

Tipos de linha (`InferSelectModel`/`InferInsertModel`) são inferidos direto do `columns` do schema — não se redeclara o shape da entidade em outro lugar.

MVP cobre `select`/`insert`/`update`/`delete` com `where`/`orderBy`/`limit`/`offset`, transactions (`db.transaction`) e um escape hatch de SQL raw (`db.execute`). Sem relations/joins, sem agregações — isso fica pra depois. Contrato completo, operadores e o mapeamento de tipo coluna→TS em [`query-layer.md`](./query-layer.md).

Uma consequência direta do Trigger Engine: **todo write que passa pela camada de query (ou até raw SQL) dispara a trigger e entra na sync_queue automaticamente** — não existe um "modo silencioso" de escrever sem gerar operação de sync. A única exceção é o próprio Native Sync Engine aplicando dado vindo do servidor, que precisa de um jeito de não reenfileirar o que acabou de baixar (pendência em aberto, ver `mvp-scope.md`).

---

## Contrato declarativo

Nada de função JavaScript participando da sincronização — o contrato inteiro é dados (JSON-like), interpretado pelo engine nativo.

```ts
export const CustomerSchema = {
  name: "customers",
  version: 1,
  primaryKey: "id",

  columns: {
    id: { type: "text" },
    name: { type: "text" },
    phone: { type: "text" },
    updatedAt: { type: "datetime" }, // required when sync.enabled — used by lastWriteWins
  },

  sync: {
    enabled: true,
    direction: "bidirectional",
    strategy: "operations",
    conflict: "lastWriteWins",
    transport: "rest",

    endpoint: {
      method: "POST",
      path: "/sync/customers",
    },

    background: {
      enabled: true,
      minimumInterval: 15,
      requiresNetwork: true,
    },

    pagination: {
      pageSize: 200,
      maxPagesPerSession: 20,
    },

    request: {
      body: {
        cursor: { $ref: "cursor" },
        operations: { $ref: "operations" },
        pageSize: { $ref: "pageSize" },
      },
    },

    response: {
      cursor: "$.cursor",
      operations: "$.operations",
      hasMore: "$.hasMore",
    },
  },
} satisfies SchemaDefinition<Customer>;
```

Cada campo abaixo é uma decisão deliberada, não um placeholder.

**`strategy: "operations"`** — a fila de sync envia diffs (insert/update/delete), não snapshots. É o modo mais barato de manter client e server consistentes sem reenviar o mundo inteiro a cada sync.

**`conflict: "lastWriteWins"`** — quando o mesmo registro muda local e remotamente, compara `updatedAt` e o mais recente vence. Determinístico, sem fila de conflito manual, sem UI de merge.

**`transport: "rest"`** — o HTTP Client nativo só fala REST no MVP.

**`pagination`** — `pageSize` limita quantos itens vão por request (tanto no pull quanto no lote de push). `maxPagesPerSession` é um teto de segurança: mesmo com `hasMore: true`, o engine para depois de N páginas pra não drenar bateria numa única wake do scheduler. O resto do dataset é pego na próxima wake, porque o cursor já avançou.

**`background`** — configura o *critério* de agendamento daquele schema especificamente (intervalo mínimo, exigir rede). Mas isso **não** significa um job nativo por schema: existe um único job nativo (WorkManager no Android, BGTaskScheduler no iOS) que acorda o Native Sync Engine, e o engine é quem itera todos os schemas com `background.enabled: true` e decide o que sincronizar naquela wake.

---

## Configuração global e credenciais

```ts
Database.configure({
  baseUrl: "https://api.company.com",
  network: { timeout: 30000 },
  credentials: {
    provider: "oauth2",
    accessToken: { headerName: "Authorization" },
    refresh: {
      endpoint: "/auth/refresh",
      request: {
        refreshToken: { $ref: "refreshToken" },
      },
      response: {
        accessToken: "$.accessToken",
        refreshToken: "$.refreshToken",
      },
    },
  },
})
```

Credencial é **única e global** por app no MVP — não existe override por schema. Todo request de sync usa o mesmo provider.

O fluxo de token é 100% nativo:

```text
Sync → Access Token → 401? → Refresh Token → salva novos tokens → reexecuta requisição
```

Tokens ficam no Keychain (iOS) / Keystore (Android). O JavaScript nunca vê o token nem participa do refresh.

---

## Resiliência

Retry de sync é **fixo e global**: 3 tentativas, 5 segundos de delay, hardcoded no engine nativo. Não é configurável por schema no MVP — existe só pra garantir que uma falha de rede isolada não derruba a sync inteira enquanto o app roda sem supervisão em background.

---

## O que fica de fora (por enquanto)

O contrato é desenhado pra crescer sem quebrar quem já o usa — union types de 1 membro hoje, mais membros amanhã. Fora do MVP: sync strategy `incremental`/`full`, conflict `serverWins`/`clientWins`/`manual`, transport `graphql`/`grpc`, credencial por schema, retry configurável por schema, compressão, criptografia, paginação avançada (page tokens), dependências entre schemas, multi-tenant. Detalhe de cada um e o porquê em [`mvp-scope.md`](./mvp-scope.md).

---

## Onde cavar mais fundo

- [`mvp-scope.md`](./mvp-scope.md) — decisões, trade-offs, o que foi cortado e por quê.
- [`architecture.md`](./architecture.md) — contrato TypeScript completo de sync (MVP + reservado).
- [`query-layer.md`](./query-layer.md) — contrato TypeScript completo do ORM (builder, operadores, inferência de tipos).
- [`overview.md`](./overview.md) — visão de longo prazo do projeto.
