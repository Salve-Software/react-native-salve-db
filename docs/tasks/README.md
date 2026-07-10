# Tarefas do MVP

Quebra do MVP (ver [`../mvp-scope.md`](../mvp-scope.md)) em tarefas independentes, pensadas pra times paralelos pegarem sem pisar uma na outra. Cada tarefa segue [`TEMPLATE.md`](./TEMPLATE.md).

## Índice

| # | Tarefa | Status | Prioridade | Área | Depende de | Skills |
|---|---|---|---|---|---|---|
| [001](./001-ts-contracts.md) | Contratos TypeScript | ✅ | P0 | TS | — | `api-design` |
| [002](./002-nitro-hybrid-spec.md) | Nitro HybridObject Spec | ✅ | P0 | TS | 001 | `build-nitro-modules`, `api-design` |
| [003](./003-test-harness-bootstrap.md) | Bootstrap de test harness | ✅ | P1 | Tooling | — | — |
| [004](./004-sqlite-core.md) | SQLite Core & Connection Management | ⬜ | P0 | C++ (core) | 002 | `cpp` |
| [005](./005-migration-engine.md) | Schema Registration & Migration Engine | ⬜ | P0 | C++ (core) | 004 | `cpp` |
| [006](./006-trigger-engine-sync-queue.md) | Trigger Engine & Sync Queue | ⬜ | P0 | C++ (core) | 005 | `cpp` |
| [007](./007-query-executor.md) | Query Executor | ⬜ | P1 | C++ (core) | 004 | `cpp` |
| [008](./008-expression-interpreter.md) | Interpretador de Expressões Declarativas | ⬜ | P1 | C++ (core) | 004 (parcial) | `cpp` |
| [009](./009-credential-provider.md) | Credential Provider | ⬜ | P1 | Android+iOS | 002, 008 | `kotlin`, `swift` |
| [010](./010-http-client.md) | HTTP Client | ⬜ | P1 | Android+iOS | 002 | `kotlin`, `swift` |
| [011](./011-background-scheduler.md) | Background Scheduler | ⬜ | P2 | Android+iOS | 002, 012 | `kotlin`, `swift` |
| [012](./012-sync-orchestrator.md) | Sync Orchestrator | ⬜ | P1 | C++ (core) | 006, 008, 009, 010 | `cpp` |
| [013](./013-query-builder.md) | Query Builder (TS, estilo Drizzle) | ⬜ | P1 | TS | 001, 002 | `api-design` |
| [014](./014-public-api-configure-register.md) | Public API: `Database.configure/register` | ⬜ | P1 | TS | 001, 002, 005, 009 | `api-design`, `build-nitro-modules` |
| [015](./015-readme-rewrite.md) | Reescrever README.md | ⬜ | P2 | Docs | — | — |

**Status:** ⬜ Não iniciado · 🟡 Em andamento · ✅ Finalizado — atualize aqui **e** no campo `**Status:**` do arquivo da tarefa ao mudar.

## Grupos de paralelismo

```text
Dia 1 (sequencial, rápido, idealmente 1 pessoa): TASK-001 → TASK-002
                                                          │
        ┌───────────────┬───────────────┬────────────────┼─────────────────┐
        ▼               ▼               ▼                ▼                 ▼
   TASK-003         TASK-004        TASK-010          TASK-013          TASK-015
  (test harness)   (SQLite core)   (HTTP client)    (query builder,   (README —
                        │                             mock executor)   qualquer hora)
                        ▼
                   TASK-005 → TASK-006 → TASK-008
                        │                    │
                        ▼                    ▼
                   TASK-014            TASK-009 (+ TASK-002, TASK-008)
                                             │
                                             ▼
                              TASK-012 (integração — TASK-006+008+009+010)
                                             │
                                             ▼
                                        TASK-011 (background scheduler)
```

**Exceções (não dividir entre pessoas diferentes):**

- **TASK-004 → 005 → 006 → 008**: mesmo código C++ do core, construído em sequência. Recomendado 1 dev/par dedicado do início ao fim, não fatiar entre pessoas diferentes no meio da cadeia.
- **TASK-012 (Sync Orchestrator)**: tarefa de integração, puxa quase todo o resto do core (006, 008, 009, 010). Fica melhor com quem já entende o core inteiro, não é bom primeiro pick.

Todo o resto é genuinamente paralelizável a partir do momento em que suas dependências diretas fecham.

## Convenção de cada tarefa

Prioridade (`P0` bloqueante / `P1` núcleo do MVP / `P2` pode esperar), área, dependências, e — decisão desta sessão de planejamento — um campo **Skills obrigatórias** apontando qual(is) skill(s) de `.claude/skills/` (`cpp`, `kotlin`, `swift`, `build-nitro-modules`, `api-design`) precisam ser invocadas antes de implementar aquela tarefa, garantindo que as convenções de cada domínio (RAII em C++, coroutines em Kotlin, `async`/`await` em Swift, forma de HybridObject spec, forma de API pública TS) não sejam puladas.
