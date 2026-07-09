
# Native Offline Database (Working Draft)

> Este doc descreve a **visão completa** do projeto. Pro escopo fechado do MVP (o que está fixo/implementado agora vs. reservado pra depois), ver [`docs/mvp-scope.md`](./mvp-scope.md).

  

## Visão

  

Esta biblioteca propõe um banco SQLite voltado para aplicações

**offline-first**, onde o mecanismo de sincronização é executado no

código nativo (Swift/Kotlin), sem depender da inicialização da camada

JavaScript durante tarefas em background.

  

## Objetivos

  

- SQLite como fonte da verdade.

- Change tracking automático.

- Triggers nativas para registrar operações.

- Fila de sincronização persistente.

- Sincronização em background via WorkManager/BGTaskScheduler.

- Contratos declarativos em TypeScript.

- Refresh de token totalmente nativo.

  

## Arquitetura

  

``` text

React Native

│

▼

Database.configure()

Database.register()

│

▼

Native Sync Engine

├── SQLite

├── Trigger Engine

├── Sync Queue

├── HTTP Client

├── Credential Provider

├── Background Scheduler

└── Migration Engine

```

  

## Camadas

  

### Database

  

Responsável por: - abrir SQLite; - executar migrations; - registrar

schemas; - registrar configuração global.

  

### Schema

  

Cada entidade registra: - tabela; - colunas; - índices; - estratégia de

sincronização.

  

Exemplo:

  

``` ts

Database.register({

schema: CustomerSchema

})

```

  

### Trigger Engine

  

Toda alteração gera automaticamente uma operação.

  

``` text

UPDATE customer

  

↓

  

Trigger SQLite

  

↓

  

sync_queue

```

  

Operações registradas: - INSERT - UPDATE - DELETE

  

Nenhum repositório precisa lembrar de adicionar registros na fila.

  

### Sync Queue

  

Persistida em SQLite.

  

Exemplo:

  

operation entity id payload

----------- ---------- ---- ---------

INSERT customer 10 {...}

  

### Native Sync Engine

  

Executado por: - abertura do app; - mudança de conectividade; -

sincronização manual; - Background Task.

  

Fluxo:

  

``` text

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

Paginação (MVP: `pageSize` + `hasMore`, sem page tokens) evita request/response gigante em dataset ou fila grande. Teto de páginas por sessão (`maxPagesPerSession`) evita loop longo drenando bateria numa única wake do scheduler — se sobrar dado, retoma no próximo wake.

  

## Contratos Declarativos

  

Nenhuma função JavaScript participa da sincronização.

  

Exemplo:

  

``` ts

sync: {

endpoint: {

method: "POST",

path: "/sync/customers"

},

request: {

body: {

cursor: { $ref: "cursor" },

operations: { $ref: "operations" }

}

},

response: {

cursor: "$.cursor",

operations: "$.operations"

}

}

```

  

O Native Engine interpreta esse contrato.

  

## Configuração Global

  

``` ts

Database.configure({

baseUrl: "https://api.company.com",

network: {

timeout: 30000

},

credentials: {

provider: "oauth2"

}

})

```

  

## Base URL

  

Todos os endpoints são relativos ao baseUrl.

  

``` text

baseUrl

https://api.company.com

  

+

  

/sync/customers

  

=

  

https://api.company.com/sync/customers

```

  

## Credenciais

  

Responsabilidade exclusiva da camada nativa.

  

**MVP: credencial única e global**, configurada em `Database.configure()`. Não existe override por schema/endpoint — todo request de sync usa o mesmo provider. Override por schema fica reservado pra quando houver caso real de múltiplas APIs.

  

Armazenamento: - Android → Keystore - iOS → Keychain

  

Fluxo:

  

``` text

Sync

  

↓

  

Access Token

  

↓

  

401?

  

↓

  

Refresh Token

  

↓

  

Salvar novos tokens

  

↓

  

Reexecutar requisição

```

  

O JavaScript nunca participa.

  

## Refresh Token

  

Contrato declarativo:

  

``` ts

credentials: {

provider: "oauth2",

refresh: {

endpoint: "/auth/refresh",

request: {

refreshToken: { $ref: "refreshToken" }

},

response: {

accessToken: "$.accessToken",

refreshToken: "$.refreshToken"

}

}

}

```

  

## Estratégias

  

- operations — **MVP: única implementada**

- incremental — reservado (pull por cursor, catch-up de dataset grande)

- full — reservado (snapshot completo)

  

## Conflitos

  

- lastWriteWins — **MVP: única implementada** (compara `updatedAt`, maior vence)

- serverWins, clientWins, manual — reservados (`manual` exige fila de conflito + UI de resolução, fora do MVP)

  

## Migration Engine

  

MVP: auto-diff de coluna. Ao abrir o banco, compara `version` do schema declarado com a versão persistida e aplica `ALTER TABLE ADD COLUMN` pras colunas novas.

  

Coluna removida do schema TS não é dropada — fica órfã no SQLite sem uso. Sem `DROP COLUMN`/`RENAME` (destrutivo, caro no SQLite) e sem scripts up/down no MVP.

  

## Background

  

Android: WorkManager

  

iOS: BGTaskScheduler

  

Um único job nativo acorda o Native Sync Engine. O engine então itera todos os schemas com `sync.background.enabled: true` e decide o que sincronizar — não é um job agendado por schema, o agendamento (`minimumInterval`, `requiresNetwork`) é só o critério que cada schema usa quando o job já acordou.

  

## Benefícios

  

- Sem inicializar JS em background.

- Menor consumo de bateria.

- Menor latência.

- Sincronização consistente.

- API declarativa.

- Independente de Expo ou React Native em tempo de execução.
