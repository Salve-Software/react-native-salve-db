# TASK-011 — Background Scheduler (Android+iOS)

**Status:** 🟡 Implementado — validação de release pendente (build Xcode/CocoaPods real e verificação de SO, ver checklist abaixo)
**Prioridade:** P2 (pode esperar)
**Área:** Android+iOS (+ C++ core — escopo expandido, ver nota abaixo)
**Depende de:** TASK-002, TASK-012 (o wake real precisa do Sync Orchestrator pronto pra ser acionado)
**Bloqueia:** Nenhuma
**Skills obrigatórias:** `kotlin`, `swift`, `cpp`

## Nota de escopo (pós-implementação)

Duas expansões de escopo, decididas em sessão de planejamento antes da implementação:

1. **`minimumInterval`/`requiresNetwork`/`requiresCharging` migraram de `SyncDefinition.background` (per-schema) para `Database.configure({ background })` (global).** Só existe um job nativo, então agregar essas 3 propriedades entre N schemas exigiria uma política arbitrária. `background.enabled` continua per-schema (é quem o Sync Orchestrator lê pra decidir o que sincronizar quando já acordado). Ver `docs/mvp-scope.md` e `docs/architecture.md`.
2. **Cold-start (app totalmente morto) foi resolvido nesta task, não adiado.** `DatabaseManager` só existia em memória após `Database.configure()`; um wake em processo novo não conseguia reabrir o banco nem saber o `baseUrl`. `NativeConfigStore` (`cpp/database/`) persiste a config necessária em disco e `DatabaseManager::reopenFromPersistedConfigIfNeeded()` reidrata sem JS. Isso trouxe a skill `cpp` para dentro do escopo desta task, além de `kotlin`/`swift`.

## Descrição

Android: WorkManager. iOS: BGTaskScheduler. Ambos fazem a mesma coisa conceitualmente: **um único job nativo acorda o Native Sync Engine** — não é um job por schema.

Implementado:

1. Job único por plataforma: `SalveDbBackgroundWorker` (`androidx.work.CoroutineWorker`, `enqueueUniquePeriodicWork`) e `SalveDbBackgroundScheduler` (`BGProcessingTaskRequest`, registrado em `+load`). Intervalo = `max(minimumInterval, piso da plataforma)` — WorkManager impõe 15min; iOS não garante intervalo (best-effort do SO).
2. Ao acordar, chama `wakeBackgroundSyncFromNative()` (`cpp/sync/SyncNativeEntryPoint`), que rehidrata `DatabaseManager` se necessário e delega a `triggerSyncAllFromNative()` — sem subir a JS engine.
3. `requiresNetwork`/`requiresCharging` viram `Constraints`/`BGProcessingTaskRequest.requires*` do job nativo, lidos via `nativeBackgroundConstraints()`.
4. Reagendamento: Android via `ExistingPeriodicWorkPolicy.UPDATE` (WorkManager persiste e sobrevive a reboot); iOS resubmete a cada `handle()` e re-registra a cada cold launch via `+load`.

## Docs de referência

- `docs/overview.md` → seção "Background".
- `docs/project.md` → explicação do campo `background` no exemplo de schema comentado.
- `docs/mvp-scope.md` → "Inconsistências resolvidas" (#3) — decisão de job único global (não reabrir) e localização das 3 propriedades de agenda (global, não per-schema).
- `docs/architecture.md` → seção "Background" (`IBackgroundDefinition`, `BackgroundParams`).
- `docs/native-layer.md` → padrão real de bridge (`platform::scheduleBackgroundSync`, `NativeConfigStore`), substituindo o sketch original de `IBackgroundScheduler`.

## Critérios de aceite

Os `[x]` abaixo significam "lógica implementada e coberta por teste automatizado (C++/Kotlin/Swift)" — **não** "verificado em dispositivo/SO real". Essa segunda parte é o checklist manual logo abaixo, que ainda não foi executado.

- [x] Um único job nativo registrado por plataforma — lógica coberta por unit tests; contagem real de jobs no SO ainda pendente.
- [x] Job acordando aciona o Sync Orchestrator sem inicialização de JS engine — `wakeBackgroundSyncFromNative` coberto por Catch2 (inclusive a partir de estado fechado/cold-start); ausência real de JS thread ainda pendente.
- [x] `requiresNetwork`/`requiresCharging` respeitados como constraint do job — cobertos por `BackgroundScheduleDecisionTest`/`BackgroundScheduleDecisionTests` (Kotlin/Swift).
- [x] Reagendamento correto — `enqueueUniquePeriodicWork(UPDATE)` e resubmit em `+load`/`handle()`; sobrevivência a restart real ainda pendente.

Checklist de verificação manual (não coberta por unit test, roda contra `example/`) — **pendente**:
- Android: `adb shell dumpsys jobscheduler | grep salve` com ≥2 schemas `background.enabled` confirma 1 job só.
- Android: `adb shell am force-stop` + `adb shell cmd jobscheduler run` confirma sync sem bridge RN ativa.
- Android: `adb reboot` confirma reagendamento.
- iOS: lldb `_simulateLaunchForTaskWithIdentifier:@"com.salvedb.background.sync"` confirma wake e resubmit.
- iOS: build real via Xcode/CocoaPods (`pod install` local está bloqueado por um mismatch de bundler/Ruby, não verificado nesta sessão).

## Riscos e limitações conhecidas

- iOS `BGTaskScheduler` é best-effort do SO — `earliestBeginDate` é um piso, não uma garantia de quando a task roda.
- Android `PeriodicWorkRequest` impõe piso de 15min; `minimumInterval` menor é clampado.
- `SalveDbBackgroundWorker` roda dentro da janela de ~10min do `CoroutineWorker` chamando `nativeWakeBackgroundSync()` (bloqueante, sem retry explícito). Aceito como limitação: o job é periódico (WorkManager roda de novo no próximo ciclo) e `maxPagesPerSession` já limita o tamanho de uma sessão de sync; promover pra foreground worker exigiria notificação persistente ao usuário, desproporcional pra sync de dados em background.
- `wakeBackgroundSync()` no iOS não tem cancelamento real — se a `expirationHandler` disparar, a chamada nativa síncrona continua até terminar mesmo assim (só o double-`setTaskCompleted` é evitado). `SyncOrchestrator` não tem suporte a cancelamento no C++ hoje.

## Fora de escopo

Qualquer lógica de "o que sincronizar" ou como (isso é inteiramente TASK-012). Sync manual/on-open (não é background, é chamada direta via TASK-002 bridge). Guardar `startReactNative` atrás de um launch-reason check no app consumidor — documentado como requisito, não implementado no `example/`.
