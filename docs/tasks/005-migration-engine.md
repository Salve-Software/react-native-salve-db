# TASK-005 — Schema Registration & Migration Engine (C++)

**Status:** ⬜ Não iniciado
**Prioridade:** P0 (bloqueante)
**Área:** C++ (core)
**Depende de:** TASK-004
**Bloqueia:** TASK-006, TASK-014
**Paralelizável:** Não com TASK-004/006/007/008 (mesma base de código C++, sequencial dentro do grupo).
**Skills obrigatórias:** `cpp`

## Antes de começar

Invoque `cpp` — atenção especial à parte de parsing/validação do `SchemaDefinition` vindo via JSI (marshaling de objeto complexo do JS pro C++) e ao uso de `std::variant`/`std::optional` pra representar coluna nullable/com default.

## Descrição

Recebe um `SchemaDefinition<TEntity>` (serializado do JS, ver TASK-001/002) e é responsável por duas coisas:

1. **Criação de tabela**: primeira vez que um schema é registrado, gera `CREATE TABLE` a partir de `columns` (mapeando `ColumnDefinition.type` pro tipo SQLite correspondente) e `CREATE INDEX` a partir de `indexes`.
2. **Migration automática (auto-diff de coluna)**: da segunda vez em diante, compara a `version` declarada no schema com a versão persistida (guardar isso numa tabela de metadata interna, ex: `_schema_versions(name, version)`) e aplica `ALTER TABLE ADD COLUMN` só pras colunas novas. **Coluna removida do schema TS não é dropada** — fica órfã na tabela SQLite, sem uso. Não implementar `DROP COLUMN`/`RENAME` — é decisão explícita do MVP (destrutivo, caro/limitado no SQLite), não uma limitação a corrigir depois sem re-abrir a decisão com o time.

Use `execute()`/transações da TASK-004 como base — esta tarefa não reimplementa acesso a SQLite, só monta o SQL de DDL e orquestra a sequência (ler version persistida → decidir CREATE vs ALTER → aplicar → gravar nova version, tudo numa transação).

## Docs de referência

- `docs/project.md` → seção "Migration Engine" — a explicação em prosa do comportamento esperado, incluindo a razão de não dropar coluna.
- `docs/mvp-scope.md` → linhas "Migrations" e "Migration / coluna removida" na tabela de decisões — a justificativa formal de por que é auto-diff e não scripts up/down.
- `docs/architecture.md` → seções "Schema Contract", "Column", "Index" — os types exatos que chegam aqui (já implementados na TASK-001).

## Critérios de aceite

- [ ] Registrar um schema novo cria a tabela + índices corretamente (colunas, tipos, `nullable`, `unique`, `default`, tudo respeitado).
- [ ] Registrar o mesmo schema de novo (sem mudança de `version`) é idempotente — não recria nem falha.
- [ ] Bump de `version` com coluna nova adicionada ao `columns` do schema resulta em `ALTER TABLE ADD COLUMN` aplicado, dado existente preservado.
- [ ] Bump de `version` com coluna **removida** do schema não dropa a coluna no SQLite (teste explícito verificando que a coluna órfã ainda existe e os dados nela continuam intactos).
- [ ] Tabela de metadata (`_schema_versions` ou equivalente) reflete a version atual após cada migration.
- [ ] Teste cobrindo o caminho "app abre com banco já em version N, schema declarado está em version N+2" (mais de um bump de version desde a última abertura) aplicando todos os diffs pendentes corretamente.

## Fora de escopo

Triggers de sync / `sync_queue` / `_sync_apply_lock` (TASK-006 — mesmo rodando depois da tabela existir, é tarefa separada). Qualquer coisa relacionada a `sync` dentro do `SchemaDefinition` (o campo `sync?` é ignorado por esta tarefa, só `columns`/`indexes`/`version`/`primaryKey` importam aqui).
