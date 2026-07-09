# TASK-004 — SQLite Core & Connection Management (C++)

**Status:** ⬜ Não iniciado
**Prioridade:** P0 (bloqueante)
**Área:** C++ (core)
**Depende de:** TASK-002
**Bloqueia:** TASK-005, TASK-006, TASK-007, TASK-008, TASK-012
**Paralelizável:** Não com TASK-005/006/007/008 (todas no mesmo código C++, construídas em cima desta) — mas pode rodar em paralelo com as tarefas de plataforma (TASK-009/010) e TS (TASK-013).
**Skills obrigatórias:** `cpp`

## Antes de começar

Invoque `cpp` — RAII pra gerenciar o handle da conexão SQLite (sem `close()` manual esquecível), `std::variant` pra representar valor de coluna/param (`text`/`integer`/`real`/`boolean`/`blob`/`datetime` — ver mapeamento de tipos em `query-layer.md`), e a convenção de binding Nitro (como esse C++ é exposto pro JNI/Swift-C++ interop) são todas coisas que a skill documenta.

## Descrição

Esta é a fundação literal de todo o resto do core nativo. O projeto já decidiu (nesta sessão) que o engine roda em C++ compartilhado — `cpp/` ainda não existe no repo, mas `android/CMakeLists.txt` já tem `include_directories("../cpp")` e o `.podspec` já faz glob de `cpp/**/*.{hpp,cpp}`, então a infra de build está pronta, só falta o código.

Implemente:

1. **Abertura/fechamento de conexão** — um arquivo de banco por app (path decidido em `configure()`, TASK-002/014). `PRAGMA journal_mode=WAL` e `PRAGMA foreign_keys=ON` no open.
2. **Wrapper de prepared statement** com **cache LRU chaveado pelo texto do SQL** — esta é a decisão de performance já fechada em `query-layer.md`: o gargalo real é I/O de disco, não geração de string em JS, e reutilizar prepared statements evita re-parse/re-plan do SQLite a cada chamada. Defina um tamanho de cache razoável (ex: 100 statements) e a política de eviction.
3. **Execução parametrizada genérica**: uma função tipo `execute(sql, params) -> vector<Row>` que faz bind dos params (usando o `std::variant` de tipo de coluna) e itera o resultado. Essa função é a base que TASK-007 (Query Executor) e TASK-006 (Trigger Engine/apply do sync) vão chamar por cima.
4. **Transações**: `begin()`/`commit()`/`rollback()`, usados por TASK-012 (apply do sync, dentro do `_sync_apply_lock`) e pelo `db.transaction()` exposto via TASK-013.

## Docs de referência

- `docs/project.md` → seção "Arquitetura" — onde este componente (`SQLite` na lista) se encaixa no diagrama nativo.
- `docs/query-layer.md` → seção "Decisão: execução via SQL string + params" — a justificativa completa do porquê deste design (não é AST nativo) e por que cache de prepared statement é o ganho de perf real.
- `docs/query-layer.md` → tabela "Inferência de tipos" — mapeamento `ColumnDefinition.type` → tipo TS, que espelha o `std::variant` de valor de coluna que este C++ precisa representar.

## Critérios de aceite

- [ ] `cpp/` criado com a implementação (arquivo(s) nomeados por domínio, ex: `SqliteConnection.hpp/.cpp`, `PreparedStatementCache.hpp/.cpp`).
- [ ] Build Android (CMake) e iOS (podspec) compilam sem erro incluindo este novo código.
- [ ] `execute(sql, params)` testado (via convenção de teste nativo definida na TASK-003) contra pelo menos: SELECT simples, INSERT com params de todos os tipos de coluna, transação com rollback.
- [ ] Cache de prepared statement comprovadamente reutiliza (teste que executa a mesma SQL 2x e verifica que não há re-`prepare`, via contador/instrumentação).
- [ ] Nenhum leak de conexão/statement (RAII garantindo cleanup mesmo em exceção/erro).

## Fora de escopo

Criação de tabela a partir de `SchemaDefinition` (TASK-005). Triggers e `sync_queue` (TASK-006). Interpretação de `RequestExpression`/`JsonPath` (TASK-008). Qualquer lógica de sync (TASK-012).
