---
title: Testes
---

O Salve DB é coberto por quatro suítes independentes, divididas ao longo das mesmas linhas da
[arquitetura](./architecture.md): núcleo nativo, camada de DX em TypeScript, stack completa no
dispositivo, e camadas de compatibilidade de plataforma.

| Suite | Command | What it covers |
|---|---|---|
| Native core | `npm run test:native` | C++ engine end-to-end through a real Hermes JSI runtime (Catch2, ~1s, no simulator) |
| TypeScript unit | `npm test` | Query builders, condition compiler, cache, hooks, provider (Jest) |
| On-device harness | `npm run test:harness:ios` / `npm run test:harness:android` | Full JSI stack on a simulator/emulator via `react-native-harness`, including real sync against `salve-db-server` |
| Platform native unit | `npm run test:native:ios` / `npm run test:native:android` | Swift (`swift test`) and Kotlin (Gradle/JUnit) unit tests |

## Núcleo nativo — `npm run test:native`

Esta é a suíte que exercita o motor de banco de dados real: `HybridSalveDatabase`, a
`SQLiteConnection`, o Migration Engine, o Trigger Engine e o Sync Orchestrator, todos conduzidos
através da bridge JSI real, e não de um mock. Ela roda contra um runtime Hermes real hospedado em
um binário de teste em C++ (`cpp/tests/`), sem nenhum simulador, emulador ou app React Native
envolvido — é isso que a mantém em aproximadamente um segundo. O núcleo vincula uma implementação
fake de `platform::*` (`cpp/tests/support/platform_test.cpp`) em vez da real de iOS/Android, então
ela nunca toca em Keychain/Keystore, `BGTaskScheduler`/`WorkManager`, ou em uma rede ao vivo — veja
[Arquitetura](./architecture.md#por-que-núcleo-em-c--swiftkotlin-nas-bordas-e-não-100-de-um-ou-de-outro) para entender
por que essa substituição é possível sem falsificar a própria lógica de negócio.

Execute isso após **qualquer** mudança em `cpp/`. Não é opcional — comportamento nativo novo ou
alterado precisa de um teste novo ou alterado na mesma mudança, espelhando a própria organização de
`cpp/` dentro de `cpp/tests/` (`cpp/database/*` → `cpp/tests/database/`, `cpp/query/*` →
`cpp/tests/query/`, `cpp/sync/*` → `cpp/tests/sync/`).

## TypeScript unit — `npm test`

Testes Jest para tudo que vive puramente na camada de DX: a compilação de SQL/params do query
builder, os operadores de condição (`eq`, `like`, `inArray`, ...), a lógica de chave do cache de
statements preparados, `useQuery`/`useInfiniteQuery`, e `<SalveDbProvider>`. Esses testes não tocam
em SQLite ou JSI — eles verificam o que é construído e repassado adiante, não a execução.

Execute isso ao mudar qualquer coisa em `src/` — o query builder, hooks, provider, ou a superfície
pública da API `Database`.

## On-device harness — `npm run test:harness:ios` / `:android`

A única suíte que roda a stack completa de ponta a ponta em um simulador/emulador real via
[`react-native-harness`](https://github.com/callstack/react-native-harness): TypeScript → JSI →
núcleo C++ → camada de compatibilidade de plataforma real (Keychain/Keystore,
`URLSession`/`OkHttp`) → uma instância viva de `salve-db-server` para sincronização real de
push/pull. Esta é a única suíte capaz de capturar bugs de fiação (wiring) da camada de
compatibilidade de plataforma (por exemplo, uma chamada JNI que compila mas nunca chega ao lado
Kotlin) ou uma incompatibilidade do contrato de sincronização contra um servidor real.

Execute isso antes de lançar um release, ou ao mudar qualquer coisa que cruze a fronteira C++ ↔
Swift/Kotlin, o agendamento em background, ou o contrato REST de sincronização — veja
[docs/sync-rest-contract.md](https://github.com/Salve-Software/react-native-salve-db/blob/main/docs/sync-rest-contract.md)
para o contrato em si.

## Platform native unit — `npm run test:native:ios` / `:android`

Testes de unidade simples com `swift test` (iOS) e Gradle/JUnit (Android), restritos às próprias
camadas de compatibilidade Swift/Kotlin — registro do agendador de background, comportamento do
adaptador HTTP, wrappers de armazenamento seguro — sem passar por JSI ou por um app completo. Útil
para iterar no shim de uma plataforma isoladamente antes de rodar o on-device harness, mais lento.

Execute isso ao mudar código de shim em `ios/` ou `android/` diretamente.

## Orientação prática

- Ao mexer em `cpp/`: execute `npm run test:native` — obrigatório, não opcional.
- Ao mexer em `src/`: execute `npm test` (e `npm run typecheck`).
- Ao mexer nas camadas de compatibilidade de plataforma `ios/`/`android/`: execute primeiro a
  suíte `test:native:ios`/`:android` correspondente, depois o on-device harness antes de fazer
  merge.
- Preparando um release, ou mexendo em fiação de sincronização/background/credenciais que cruza a
  fronteira JSI ou de plataforma: execute o on-device harness para ambas as plataformas.
