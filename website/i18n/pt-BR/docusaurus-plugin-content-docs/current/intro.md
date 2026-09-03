---
title: Introdução
sidebar_label: Introdução
---

Salve DB é um banco de dados SQLite offline-first para React Native. Você declara suas tabelas e o
contrato de sincronização REST delas como dados TypeScript puros; um core nativo em C++/Swift/Kotlin
cria as tabelas, migra-as, instala triggers SQLite que enfileiram cada escrita local, e faz
push/pull contra sua própria API REST — incluindo refresh de token OAuth2 — **sem que a engine JS
seja iniciada em nenhum momento**. Um job em background (`WorkManager` no Android, `BGTaskScheduler`
no iOS) acorda o orquestrador de sincronização nativo por conta própria; seu app não precisa estar
aberto.

Em foreground você tem um query builder tipado no estilo Drizzle, além dos hooks `useQuery` /
`useInfiniteQuery`, que re-renderizam automaticamente sempre que uma tabela muda — não importa se a
escrita veio do seu próprio código, de SQL bruto, de uma migração, ou da engine de sincronização em
background.

## Por que sincronização nativa importa

Uma engine de sincronização implementada em JS precisa rodar dentro de uma tarefa JS headless para
fazer qualquer coisa em background — no iOS isso significa fazer a ponte de callbacks do
`BGTaskScheduler` para um contexto JS que pode nem estar vivo, e no Android um job `WorkManager` que
precisa inicializar um runtime JS completo antes de poder fazer uma única requisição HTTP. Ambos
custam tempo real e bateria só para colocar a engine JS de pé, e ambos estão sujeitos ao que o SO
decidir sobre o agendamento da thread JS sob limites de execução em background — uma classe de bug
de confiabilidade que o Salve DB simplesmente não tem.

O orquestrador de sincronização, o cliente HTTP, o provedor de credenciais e o agendador em
background do Salve DB vivem inteiramente em C++/Swift/Kotlin:

- **Confiabilidade em background** — o SO acorda código nativo diretamente (`SyncNativeEntryPoint`);
  não há bundle JS para carregar, nem bridge para reconectar, nem tarefa headless que possa ser morta
  no meio da sincronização porque o runtime JS demorou demais para inicializar.
- **Bateria** — sem inicialização de VM JS, sem serialização via bridge para cada operação
  enfileirada — o loop de sincronização lê o SQLite, executa requisições HTTP e aplica os resultados,
  tudo em código nativo.
- **Corretude em cold start** — se o SO mata seu app completamente e depois acorda o job em background
  em um processo novo, o core nativo rehidrata seu estado a partir de um pequeno arquivo de
  configuração persistido e executa o passo de sincronização sem nenhum envolvimento do JS.

Em foreground, o mesmo orquestrador fica acessível a partir do JS via `Database.sync()` /
`Database.syncAll()`, e toda escrita local — seja do seu query builder, de SQL bruto, de uma
migração, ou da própria sincronização — passa pelas mesmas triggers SQLite até uma única
`sync_queue`, então não há uma contabilidade separada em JS para manter sincronizada com o estado
nativo.

## Arquitetura em resumo

```text
TypeScript (DX layer)  →  JSI (Nitro Modules)  →  Native Core (C++)  →  Swift (iOS) / Kotlin (Android)
```

- **TypeScript** — `Database.configure/register`, o query builder (`select`/`insert`/`update`/
  `delete`/`transaction`), `useQuery`/`useInfiniteQuery`, `<SalveDbProvider>`.
- **JSI (Nitro Modules)** — uma ponte zero-copy entre o JS e o core nativo; chamadas em foreground a
  atravessam de forma síncrona, e eventos de mudança nativos atravessam de volta para disparar
  re-renders do React.
- **Native Core (C++)** — execução do SQLite com cache de prepared statements, a engine de migração,
  a engine de triggers que popula a `sync_queue`, e o orquestrador de sincronização.
- **Bordas Swift / Kotlin** — as APIs de plataforma que o core C++ não consegue alcançar diretamente:
  `BGTaskScheduler` / `WorkManager` para agendamento em background, `URLSession` / `OkHttp` para HTTP,
  Keychain / Keystore para armazenamento de tokens OAuth2.

Veja [Arquitetura](./architecture.md) para o detalhamento completo de cada camada.

## Próximos passos

Vá para [Instalação](getting-started/installation.md) para adicionar o Salve DB ao seu app, e depois
siga o [Guia Rápido](getting-started/quick-start.md) para definir um schema e rodar sua primeira
query.
