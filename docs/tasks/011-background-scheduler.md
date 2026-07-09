# TASK-011 — Background Scheduler (Android+iOS)

**Status:** ⬜ Não iniciado
**Prioridade:** P2 (pode esperar)
**Área:** Android+iOS
**Depende de:** TASK-002, TASK-012 (o wake real precisa do Sync Orchestrator pronto pra ser acionado; o scaffolding de registro do job pode começar antes)
**Bloqueia:** Nenhuma
**Paralelizável:** Parcial — a parte de "registrar/agendar o job" (WorkManager/BGTaskScheduler setup) pode ser feita cedo e em paralelo; a parte de "o que o job faz ao acordar" só fecha depois da TASK-012 existir.
**Skills obrigatórias:** `kotlin`, `swift`

## Antes de começar

Invoque `kotlin` (WorkManager: `CoroutineWorker`, constraints, `PeriodicWorkRequest`) e `swift` (BGTaskScheduler: `BGAppRefreshTask`/`BGProcessingTask`, registro em `Info.plist`, `submit`/`schedule`). É a tarefa mais dependente de peculiaridade de plataforma do MVP inteiro — as APIs de Android e iOS pra "acordar em background" não têm nada em comum, então cada metade é praticamente do zero na respectiva skill.

## Descrição

Android: WorkManager. iOS: BGTaskScheduler. Ambos fazem a mesma coisa conceitualmente: **um único job nativo acorda o Native Sync Engine** — não é um job por schema. O `BackgroundDefinition` (`minimumInterval`, `requiresNetwork`, `requiresCharging`) configurado em cada `SyncDefinition.background` é o *critério* que aquele schema específico usa quando o job já acordou, não um agendamento próprio (isso já foi uma inconsistência entre `overview.md` e `architecture.md` original, resolvida em `mvp-scope.md` — ver referência abaixo, não reabrir essa decisão).

Escopo:

1. Registrar um único job periódico por plataforma (intervalo mínimo pode ser o menor `minimumInterval` entre os schemas registrados, ou um valor fixo razoável — decidir e documentar).
2. Ao acordar, chamar o Sync Orchestrator (TASK-012) via a bridge nativa — **sem subir a JS engine** (esse é o requisito central do projeto: "sem inicializar JS em background", `docs/overview.md`/`docs/project.md`).
3. O Sync Orchestrator, uma vez acordado, é quem itera os schemas com `background.enabled: true` e decide o que sincronizar — esta tarefa não decide isso, só aciona.
4. Respeitar `requiresNetwork`/`requiresCharging` como constraints do job nativo (WorkManager `Constraints`, BGTaskScheduler `earliestBeginDate`/condições de rede).

## Docs de referência

- `docs/overview.md` → seção "Background" — a descrição original (WorkManager/BGTaskScheduler "apenas acordam o Native Sync Engine").
- `docs/project.md` → explicação do campo `background` no exemplo de schema comentado (seção "Contrato declarativo") — a explicação mais completa de "um único job global, não um job por schema".
- `docs/mvp-scope.md` → linha "Background per-schema vs wake global" em "Inconsistências resolvidas" (#3) — o porquê formal desta decisão, importante pra não reintroduzir a inconsistência original por engano.
- `docs/architecture.md` → seção "Background" (`BackgroundDefinition`) — o type exato consumido.

## Critérios de aceite

- [ ] Um único job nativo registrado por plataforma (não um job por schema — teste com múltiplos schemas com `background.enabled: true` e confirmar que só existe 1 job agendado no SO).
- [ ] Job acordando de fato aciona o Sync Orchestrator (TASK-012) sem qualquer inicialização de JS engine (verificável — ex: instrumentar e confirmar que nenhuma JS thread é criada nesse caminho).
- [ ] `requiresNetwork`/`requiresCharging` de pelo menos um schema respeitados como constraint do job (testável simulando offline/sem carregar).
- [ ] Comportamento correto de reagendamento (job periódico continua rodando após a primeira execução, sobrevive a restart do app/dispositivo conforme padrão de cada plataforma).

## Fora de escopo

Qualquer lógica de "o que sincronizar" ou como (isso é inteiramente TASK-012). Sync manual/on-open (não é background, é chamada direta via TASK-002 bridge).
