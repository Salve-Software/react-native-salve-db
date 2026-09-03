---
title: Arquitetura
---

O Salve DB é dividido em três camadas: uma camada TypeScript de DX, um núcleo nativo em C++, e
finas camadas de compatibilidade (shims) em Swift/Kotlin. Tudo abaixo da camada TypeScript —
orquestração de sincronização, HTTP, credenciais, agendamento em background — roda sem iniciar o
runtime JS.

```text
┌───────────────────────────────┐        JSI (Nitro Modules)        ┌────────────────────────────────────┐
│      TypeScript (DX layer)      │ ─────────────────────────────────▶ │        Native Core (C++)            │
│                                 │                                    │                                      │
│  Database.configure/register   │                                    │  SQLite + LRU statement cache        │
│  Query Builder (select/insert  │                                    │  Migration Engine (ADD COLUMN)       │
│    /update/delete/transaction) │ ◀───────────────────────────────── │  Trigger Engine → sync_queue         │
│  useQuery / useInfiniteQuery   │        reactive change events      │  Sync Orchestrator (push → pull)     │
│  <SalveDbProvider>              │                                    │  Credential Provider (OAuth2)        │
└───────────────────────────────┘                                    │  HTTP Client                         │
                                                                       └──────────────────┬───────────────────┘
                                                                                          │
                                                              ┌───────────────────────────┴───────────────────────────┐
                                                              │        Swift (iOS) / Kotlin (Android) shims             │
                                                              │  BGTaskScheduler / WorkManager — background scheduler   │
                                                              │  NWPathMonitor / ConnectivityManager — network monitor  │
                                                              │  Keychain / Keystore — secure token storage             │
                                                              └───────────────────────────┬───────────────────────────┘
                                                                                          ▼
                                                                                  Your REST API
```

O agendador em background acorda o `SyncNativeEntryPoint` diretamente a partir de código nativo —
o runtime JS nunca é iniciado para uma passagem de sincronização em background. Em foreground, o
mesmo orquestrador é acessível a partir do JS via `Database.sync()` / `Database.syncAll()`.

## TypeScript — a camada de DX

O TypeScript é responsável apenas pela declaração e pela experiência de desenvolvimento; ele nunca
executa queries nem toca na rede diretamente:

- **Contratos de schema** — `SchemaDefinition`, `ColumnDefinition`, `IndexDefinition`,
  `RelationDefinition`, `SyncDefinition` descrevem tabelas, índices, relações e comportamento de
  sincronização como dados simples, interpretados nativamente.
- **Query Builder** — um builder `select/insert/update/delete` no estilo Drizzle. Ele apenas
  compila SQL + params; a execução acontece em C++ via JSI.
- **Camada de DX** — `Database.configure/register`, `useQuery`/`useInfiniteQuery`,
  `<SalveDbProvider>`, tipos `InferSelectModel`/`InferInsertModel`.

A ponte com o nativo é um `HybridObject` do Nitro, então as chamadas cruzam JSI diretamente — sem
serialização de bridge, sem round trip assíncrono por uma fila de mensagens.

## C++ — o núcleo nativo

O núcleo é responsável por tudo que não tem dependência de plataforma:

- **Execução SQLite** com um cache LRU de statements preparados.
- **Migration Engine** — cria tabelas na primeira execução, aplica diffs de `ADD COLUMN` quando
  `schema.version` é incrementado. Veja [Migrações](./guides/migrations.md).
- **Trigger Engine** — todo `INSERT`/`UPDATE`/`DELETE` em uma tabela sincronizada dispara um
  trigger SQLite que enfileira uma linha em `sync_queue`, então nada além de um trigger SQL precisa
  se lembrar de enfileirar uma mudança.
- **Sync Orchestrator** — conduz o loop de push → pull contra `sync_queue`, avança o cursor do
  servidor e aplica a resolução de conflitos (`lastWriteWins`/`serverWins`/`clientWins`).
- **Credential Provider** — mantém o ciclo de vida do token OAuth2 em memória e chama a camada de
  compatibilidade da plataforma para persistir/ler o segredo real.
- **HTTP Client** — constrói o ciclo de requisição/resposta de sincronização sobre
  `platform::httpExecute`.

## Swift / Kotlin — as bordas de plataforma

Uma fina camada de compatibilidade por plataforma implementa o punhado de funções que o núcleo C++
não consegue: jobs de background do SO, monitoramento de conectividade e armazenamento seguro.
Nada aqui contém lógica de negócio — é apenas fiação (wiring).

| Concern | iOS | Android |
|---|---|---|
| Agendador de background | `BGTaskScheduler` | `WorkManager` |
| Monitor de rede | `NWPathMonitor` | `ConnectivityManager` |
| Armazenamento seguro de token | Keychain | Keystore |

## Por que núcleo em C++ + Swift/Kotlin nas bordas, e não 100% de um ou de outro

A divisão é traçada em uma única linha: o componente depende de uma API do SO que não tem binding
em C++?

**Por que não 100% C++.** Os componentes de borda de plataforma estão presos a APIs do SO sem
superfície em C++:

- `BGTaskScheduler` (iOS) e `WorkManager` (Android) são APIs exclusivas de Swift/Kotlin — fazer a
  ponte de seus callbacks de ciclo de vida via JNI ou pelo runtime ObjC é frágil comparado a
  escrever a camada de compatibilidade nativamente em cada plataforma.
- Keychain (iOS) e Keystore (Android) não têm bindings em C++ para armazenamento seguro.
- Empacotar `libcurl` para HTTP significaria reimplementar manualmente suporte a proxy, cert
  pinning e configuração de TLS que `URLSession` e `OkHttp` já tratam corretamente.

**Por que não 100% Swift/Kotlin.** A lógica central — sync queue, interpretador de expressões,
resolução de conflitos, migration engine — não tem dependência de plataforma. Escrevê-la uma única
vez em C++ evita manter duas implementações paralelas da mesma lógica de negócio que
inevitavelmente divergiriam.

**O padrão de contrato.** O núcleo C++ declara funções livres no `namespace platform`
(`cpp/platform/platform.hpp`) em vez de uma interface virtual — cada build é single-platform,
então não há polimorfismo em tempo de execução a ganhar com uma hierarquia de classes. Cada
plataforma vincula sua própria implementação em tempo de build: `ios/SalveDbPlatform.mm` /
`PlatformHttp.mm` no iOS, `android/src/main/cpp/platform_android*.cpp` no Android (chamando de
volta o Kotlin via JNI para agendamento e armazenamento seguro). O agendador de background
(`platform::scheduleBackgroundSync`) segue o mesmo padrão de função livre que `httpExecute` e as
funções de credencial:

```cpp
// cpp/platform/platform.hpp — no platform dependency
namespace margelo::nitro::salvedb::platform {

std::string getSecureValue(const std::string& key);
void setSecureValue(const std::string& key, const std::string& value);

// Blocks the calling thread until the request completes — only call from a
// native background thread (e.g. inside Promise<T>::async), never from JS.
HttpOutcome httpExecute(const HttpRequest& request);

// Called at the end of Database.configure() to (re)register the native
// job from the current background config.
void scheduleBackgroundSync();

} // namespace margelo::nitro::salvedb::platform
```

Cold starts (app totalmente encerrado, o job do SO acorda um processo novo) são tratados sem JS:
`Database.configure()` espelha o que o mecanismo de sincronização precisa em um arquivo JSON ao
lado do banco SQLite (um arquivo, não uma tabela SQLite, porque o próprio caminho do banco não é
conhecido até que esse arquivo seja lido), e a camada nativa reconstrói seu estado em memória a
partir dele antes que o job tente sincronizar.

**O benefício para os testes.** Como o núcleo depende apenas dos contratos de função `platform::*`,
a suíte de testes em C++ vincula uma terceira implementação — um fake
(`cpp/tests/support/platform_test.cpp`) — em vez da real de iOS/Android. É isso que permite que
`npm run test:native` exercite o `HybridSalveDatabase` real, de ponta a ponta, através de um
runtime Hermes JSI real, sem simulador ou emulador, em cerca de um segundo. Veja
[Testes](./testing.md) para o panorama completo de qual suíte cobre o quê.
