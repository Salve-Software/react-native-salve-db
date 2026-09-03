---
title: Background Sync
---

O bloco `background` do `Database.configure` habilita um único job nativo global em background que
acorda o orquestrador de sincronização por conta própria — `WorkManager` no Android,
`BGTaskScheduler` no iOS. É um job para o banco de dados inteiro, não um por schema; todo schema com
`sync.enabled` é sincronizado a cada wake.

## Configurando o job em background

```ts
background: {
  minimumInterval: 15 * 60 * 1000, // ms
  requiresNetwork: true,
  requiresCharging: false,
}
```

- **`minimumInterval`** — intervalo mínimo entre wakes de sincronização em background, em
  milissegundos. Omita `background` por completo para deixar a sincronização em background
  desativada.
- **`requiresNetwork`** — exige conectividade de rede para o job em background rodar.
- **`requiresCharging`** — exige que o dispositivo esteja carregando para o job em background rodar.

## O agendamento difere por plataforma

- **Android (`WorkManager`)** — `minimumInterval` é limitado ao piso de periodic-work do
  `WorkManager`, de **15 minutos**. Um valor menor é aceito, mas o SO não vai disparar com mais
  frequência do que isso.
- **iOS (`BGTaskScheduler`)** — `minimumInterval` é tratado como uma **sugestão** de
  `earliestBeginDate`, não uma garantia: é o momento mais cedo em que o SO pode considerar rodar a
  tarefa, mas apenas o `BGTaskScheduler` decide o momento real com base em heurísticas do sistema
  (bateria, padrões de uso, etc.). Não há um piso fixo para limitar; o intervalo é apenas indicativo.

## O runtime JS nunca é iniciado

Um wake em background nunca inicia o engine JS. Em ambas as plataformas, o scheduler chama
diretamente o `SyncNativeEntryPoint` nativo, que aciona o mesmo `SyncOrchestrator::triggerSyncAll`
usado por `Database.syncAll()` — lendo schemas, rodando sessões de push/pull, e renovando tokens
OAuth2 em um 401 (veja [Credenciais OAuth2](../guides/credentials-oauth2.md)) — inteiramente em
C++/Swift/Kotlin. Nenhum bundle JS é carregado e nenhuma thread JS roda durante uma passagem em
background; o próprio contrato de sincronização é descrito em [Sincronização](../guides/sync.md).

## Pré-requisito no iOS

A sincronização em background e o provedor de credenciais OAuth2 precisam ambos de entradas
explícitas no `Info.plist` e de entitlements no iOS — sem eles o app compila e roda normalmente, mas
o scheduler em background nunca dispara e o provedor de credenciais não consegue persistir tokens,
sem nenhum erro em tempo de execução que aponte o motivo. Veja
[Installation](../getting-started/installation.md) para as chaves exatas do `Info.plist` e a
configuração de entitlement necessárias.
