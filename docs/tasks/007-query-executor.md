# TASK-007 — Query Executor (C++)

**Status:** ⬜ Não iniciado
**Prioridade:** P1 (núcleo do MVP)
**Área:** C++ (core)
**Depende de:** TASK-004
**Bloqueia:** TASK-013 (integração end-to-end — o builder pode ser desenvolvido antes com mock, mas precisa disto pra funcionar de verdade)
**Paralelizável:** Pode rodar em paralelo com TASK-005/006/008 (não depende delas, só de TASK-004) — mas ainda é código C++ do mesmo core, coordenar merge com quem estiver em TASK-005/006.
**Skills obrigatórias:** `cpp`

## Antes de começar

Invoque `cpp` — foco em marshaling de retorno (linhas do SQLite → estrutura que vira `InferSelectModel<T>[]` do lado JS via JSI) e no formato de erro (SQL inválido, constraint violation) que precisa cruzar a fronteira JSI de forma legível pro TS.

## Descrição

É a ponte de execução entre o Query Builder TS (TASK-013) e o SQLite Core (TASK-004). Recebe exatamente o que o método `execute` do Query bridge (definido na TASK-002) expõe: um `CompiledQuery` (`{ sql: string, params: unknown[] }`) — não recebe um AST, essa decisão já foi tomada e justificada em `query-layer.md`.

Responsabilidades:

1. Receber `{ sql, params }` vindo do JS via JSI.
2. Delegar pro `execute(sql, params)` genérico da TASK-004 (que já cuida do cache de prepared statement).
3. Marshalling do resultado: cada linha do SQLite (com seus valores tipados via `std::variant`) precisa virar um objeto JS plano, no shape que o TS do lado do Query Builder espera receber como `InferSelectModel<TSchema>[]` (a inferência de tipo em si é responsabilidade do TS/TASK-013 — este C++ só garante que o valor runtime é compatível: `boolean` SQLite (0/1) vira `boolean` JS, `datetime` (armazenado como integer epoch millis, decisão de `query-layer.md`) vira `number` JS, etc).
4. Propagação de erro: erro de SQL (sintaxe, constraint) precisa chegar do outro lado da JSI como algo que o `db.select()...execute()` da TASK-013 consiga `catch`, não como crash silencioso.

## Docs de referência

- `docs/query-layer.md` → seção "Decisão: execução via SQL string + params" — por que este componente existe nesta forma (e não como um compilador de AST nativo).
- `docs/query-layer.md` → seção "Inferência de tipos" (tabela `ColumnDefinition.type` → TS) — o contrato de marshaling que este C++ precisa respeitar pro lado JS enxergar o tipo certo.
- `docs/architecture.md` → coluna `type` em "Column" — os 6 tipos SQLite-side que precisam de conversão (`text`/`integer`/`real`/`boolean`/`blob`/`datetime`).

## Critérios de aceite

- [ ] `execute({ sql, params })` chamado do JS (via o HybridObject da TASK-002) retorna linhas corretas pra SELECT simples.
- [ ] INSERT/UPDATE/DELETE via este mesmo caminho funcionam e dispersam as triggers da TASK-006 normalmente (não passam pelo `_sync_apply_lock` — são escrita real de usuário).
- [ ] Todos os 6 tipos de coluna testados ida-e-volta (grava um valor de cada tipo, lê de volta, tipo runtime no JS bate com o esperado — `boolean` chega como `true`/`false`, não `0`/`1`).
- [ ] SQL inválido (erro de sintaxe) propaga como erro catchável no JS, com mensagem útil (não trava o app, não é `undefined` silencioso).
- [ ] Constraint violation (ex: `UNIQUE` duplicado) propaga como erro catchável e distinguível de um erro de sintaxe (o Query Builder/app vai querer tratar isso diferente).

## Fora de escopo

Geração do SQL a partir do builder fluente (`select().where()...` é TASK-013, puro TS). Cache de prepared statement (já implementado na TASK-004, esta tarefa só usa). Lógica de transação multi-statement do `db.transaction()` — o `begin`/`commit`/`rollback` já existe na TASK-004; esta tarefa só precisa expor esse encadeamento através da bridge da TASK-002 se ainda não estiver exposto.
