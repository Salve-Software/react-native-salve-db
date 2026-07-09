# TASK-012 — Sync Orchestrator (C++)

**Status:** ⬜ Não iniciado
**Prioridade:** P1 (núcleo do MVP)
**Área:** C++ (core)
**Depende de:** TASK-006, TASK-008, TASK-009, TASK-010
**Bloqueia:** TASK-011 (wake real do scheduler precisa disto pronto)
**Paralelizável:** **Não recomendado dividir entre devs diferentes** — é a tarefa de integração que puxa quase todo o resto do sistema; fica melhor com quem já entende o core inteiro (TASK-004 a 008), não como primeiro pick de alguém novo.
**Skills obrigatórias:** `cpp`

## Antes de começar

Invoque `cpp`. Esta é a tarefa com mais superfície de estado (transação + rede + retry + paginação, tudo coordenado) — preste atenção especial à parte de exception safety / RAII da skill, já que um erro no meio do loop de páginas não pode deixar `_sync_apply_lock` preso ou a `sync_queue` em estado inconsistente.

## Descrição

O fluxo completo de uma sincronização, do início ao fim — a peça que amarra Trigger Engine (TASK-006), Interpretador de Expressões (TASK-008), Credential Provider (TASK-009) e HTTP Client (TASK-010) em um único ciclo coerente. Acionado por: abertura do app, mudança de conectividade, chamada manual (via bridge da TASK-002), ou wake do Background Scheduler (TASK-011).

Fluxo (já documentado com o diagrama exato em `overview.md`/`project.md`):

```text
Ler sync_queue (até pageSize)
│
▼
Enviar página ao servidor
│
▼
Aplicar transação SQLite  (usa applyWithBypass da TASK-006 — _sync_apply_lock)
│
▼
Atualizar cursor
│
▼
hasMore && páginas < maxPagesPerSession?
├── sim → repete (próxima página, mesma sessão)
└── não → limpa fila processada, encerra sessão
```

Componentes embutidos nesta tarefa, **não são subsistemas separados**:

- **Retry fixo**: 3 tentativas, 5s de delay, hardcoded (não configurável por schema no MVP — decisão em `mvp-scope.md`). Aplica-se à chamada HTTP de cada página; se as 3 tentativas falharem, a sessão de sync encerra sem aplicar aquela página, cursor não avança além do que já foi processado com sucesso.
- **Paginação**: `pageSize`/`maxPagesPerSession` de `PaginationDefinition` — o loop acima, com o teto de segurança pra não drenar bateria numa wake só (o resto fica pro próximo wake, cursor já avançado até onde deu).
- **401 → refresh**: quando o HTTP Client (TASK-010) retorna 401, aciona o fluxo de refresh da TASK-009 e reexecuta a página atual (isso já é responsabilidade interna da TASK-009 — o orchestrator só precisa saber tratar "essa chamada pode disparar um refresh transparente por baixo").

Para cada schema com `sync.enabled: true`, o ciclo acima roda independentemente (schemas diferentes não compartilham cursor nem fila — a `sync_queue` guarda `entity` por linha, então o filtro por schema acontece na leitura).

## Docs de referência

- `docs/overview.md` → seção "Native Sync Engine" (diagrama de fluxo original) e `docs/project.md` → seção "Native Sync Engine — fluxo de uma sincronização" (versão já com o loop de paginação incorporado) — usar a versão do `project.md`, é a atualizada.
- `docs/architecture.md` → seção "Pagination" — `PaginationDefinition`, e o pseudo-fluxo do loop de página em SQL/texto.
- `docs/mvp-scope.md` → linhas "Retry" e "Paginação" na tabela de decisões — os valores fixos exatos (3 tentativas, 5s, `maxPagesPerSession` default 20) e o porquê de serem hardcoded/não-configuráveis no MVP.
- `docs/query-layer.md` → seção "Ciclo do Native Sync Engine ao aplicar página baixada" — a transação exata (`BEGIN`/lock/apply/unlock/`COMMIT`) que esta tarefa aciona via a função `applyWithBypass` da TASK-006.

## Critérios de aceite

- [ ] Sync manual (disparada via bridge) executa o ciclo completo contra um servidor de teste/mock: lê fila, envia, aplica resposta, atualiza cursor, limpa fila processada.
- [ ] Dataset/fila maior que `pageSize` resulta em múltiplas páginas processadas na mesma sessão, respeitando `hasMore`.
- [ ] `maxPagesPerSession` atingido com `hasMore: true` ainda pendente encerra a sessão sem erro, cursor reflete o progresso parcial, próxima sync continua de onde parou.
- [ ] Falha de rede simulada aciona as 3 tentativas de retry com o delay configurado antes de desistir daquela página.
- [ ] 401 simulado aciona refresh (TASK-009) de forma transparente e a página é reexecutada com sucesso após o novo token.
- [ ] Operação aplicada vinda do servidor **não** reentra na `sync_queue` (validação de que o bypass da TASK-006 está sendo usado corretamente aqui, não reimplementado).
- [ ] Crash/erro no meio do apply de uma página deixa o sistema em estado consistente (rollback completo, `_sync_apply_lock` não fica preso, cursor não avança além do que foi de fato commitado).

## Fora de escopo

Registrar/agendar o job de background em si (TASK-011 — esta tarefa só expõe o ponto de entrada que o scheduler aciona). Estratégias de sync além de `operations` (`incremental`/`full` são reservadas, fora do MVP). Conflict resolution além de `lastWriteWins` (única implementada).
