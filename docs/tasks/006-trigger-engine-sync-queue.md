# TASK-006 — Trigger Engine & Sync Queue (C++)

**Status:** ⬜ Não iniciado
**Prioridade:** P0 (bloqueante)
**Área:** C++ (core)
**Depende de:** TASK-005
**Bloqueia:** TASK-008 (integração final), TASK-012
**Paralelizável:** Não com TASK-004/005/007/008 (mesma base de código C++, sequencial dentro do grupo).
**Skills obrigatórias:** `cpp`

## Antes de começar

Invoque `cpp`. Esta tarefa é majoritariamente geração/execução de DDL (SQL puro), então a parte C++ em si é fina — foco principal da skill aqui é RAII de transação (garantir que o `_sync_apply_lock` sempre é removido, mesmo em erro) e como esse SQL gerado é montado a partir do `SchemaDefinition` (que já foi processado pela TASK-005).

## Descrição

Esta é a peça mais especificada dos docs — o SQL já está pronto, esta tarefa é implementar exatamente o que está documentado, não desenhar do zero.

Três partes:

1. **`sync_queue`**: tabela que guarda operações pendentes (`operation`, `entity`, `entity_id`, `payload`, `updated_at`) — criada uma vez, não por schema.
2. **`_sync_apply_lock`**: tabela de controle de 1 linha (`id INTEGER PRIMARY KEY CHECK (id = 1)`), usada como mecanismo de bypass (ver abaixo).
3. **Triggers por schema sincronizável**: pra cada `SchemaDefinition` com `sync.enabled: true` (registrado via TASK-005), gerar 3 triggers (`AFTER INSERT`/`AFTER UPDATE`/`AFTER DELETE`) que inserem na `sync_queue` — **exceto quando `_sync_apply_lock` tem uma linha**, condição expressa via `WHEN NOT EXISTS (SELECT 1 FROM _sync_apply_lock)` no próprio DDL da trigger.

Por que o `_sync_apply_lock` existe: sem ele, quando o Sync Orchestrator (TASK-012) aplica localmente uma operação baixada do servidor, a trigger dispara igual (ela não distingue "usuário escreveu no app" de "engine aplicou dado do servidor") e reenfileira algo que acabou de vir do servidor — loop. O lock é o jeito de avisar a trigger "não logue esta escrita", gravado no próprio banco porque é o único lugar que uma trigger SQLite consegue "ver" contexto.

**Copie o SQL de `docs/query-layer.md` → seção "Trigger bypass durante apply do sync" diretamente** — já está completo lá (tabela de lock, as 3 triggers de exemplo pra `customers`, e a transação de apply do engine). O trabalho desta tarefa é generalizar aquele exemplo pra qualquer schema (a lista de colunas do `json_object(...)` dentro da trigger precisa ser gerada dinamicamente a partir de `schema.columns`, não hardcoded como no exemplo de `customers`) e integrar a criação das triggers no fluxo de `registerSchema` (depois que TASK-005 cria/migra a tabela).

## Docs de referência

- **`docs/query-layer.md` → seção "Trigger bypass durante apply do sync" — fonte primária, SQL completo pronto pra adaptar.** Ler também "Ciclo do Native Sync Engine ao aplicar página baixada" na mesma seção — mostra a transação (`BEGIN` → `INSERT OR IGNORE` no lock → aplica operações → `DELETE` do lock → `COMMIT`) que o Sync Orchestrator (TASK-012) vai usar, mas que esta tarefa precisa deixar pronta pra ser chamada.
- `docs/overview.md` → seções "Trigger Engine" e "Sync Queue" — a explicação original em prosa (mais curta, sem o SQL).
- `docs/project.md` → seção "Trigger Engine" — versão de apresentação, útil pra contexto de por que "nenhum repositório precisa lembrar de enfileirar".

## Critérios de aceite

- [ ] `sync_queue` e `_sync_apply_lock` criadas uma única vez (não recriadas a cada `registerSchema`).
- [ ] Registrar um schema com `sync.enabled: true` cria as 3 triggers correspondentes, com a lista de colunas do `json_object` batendo exatamente com `schema.columns`.
- [ ] Registrar um schema com `sync.enabled: false` (ou sem `sync`) não cria trigger nenhuma pra essa tabela.
- [ ] Teste: INSERT/UPDATE/DELETE direto na tabela (fora de qualquer lock) gera entrada correspondente na `sync_queue`.
- [ ] Teste: INSERT/UPDATE/DELETE feito **dentro** de uma transação com `_sync_apply_lock` ativo **não** gera entrada na `sync_queue`.
- [ ] Teste: se a transação de apply falhar no meio (forçar erro) e fizer rollback, `_sync_apply_lock` não fica "preso" — próxima escrita normal volta a ser rastreada.
- [ ] Exposta uma função C++ (usada pela TASK-012) tipo `applyWithBypass(operations, fn)` que encapsula o ciclo completo (`BEGIN`/lock/aplicar/unlock/`COMMIT`) — TASK-012 não deve reescrever esse SQL, só chamar esta função.

## Fora de escopo

Ler `sync_queue` e efetivamente mandar pro servidor (isso é TASK-012). Decidir o que aplicar a partir da resposta do servidor (TASK-012 também — esta tarefa só garante que, dado um conjunto de operações a aplicar, elas entram sem reentrar na fila).
