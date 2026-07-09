# TASK-013 — Query Builder (TS, estilo Drizzle)

**Status:** ⬜ Não iniciado
**Prioridade:** P1 (núcleo do MVP)
**Área:** TS
**Depende de:** TASK-001, TASK-002 (a lógica de geração de SQL/operadores pode ser construída e testada com um `execute()` mockado antes da TASK-007 estar pronta — a integração end-to-end real depende dela)
**Bloqueia:** TASK-014 (a Public API expõe o resultado do `db` construído aqui)
**Paralelizável:** Sim — roda em paralelo ao core C++ inteiro, usando um mock do bridge `execute()` até a TASK-007 estar pronta pra integração real.
**Skills obrigatórias:** `api-design`

## Antes de começar

Invoque `api-design` — esta é a superfície mais "pública" e usada do projeto inteiro (é o que o dev consumidor da lib chama toda hora), então a forma da API (naming, encadeamento fluente, forma de erro) importa mais aqui do que em qualquer outra tarefa.

## Descrição

A camada de leitura/escrita local, inspirada no Drizzle — type-safe, builder fluente, roda em **foreground** com JS já de pé (diferente do Sync Orchestrator, que é 100% nativo/sem JS; essa distinção está documentada em `project.md` e é importante pra não tentar "purificar" essa camada removendo JS dela sem necessidade).

Implemente, usando os types já definidos na TASK-001:

1. **Operadores**: `eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `like`, `inArray`, `isNull`, `isNotNull`, `and`, `or`, `not` — funções que constroem uma representação interna de `Condition` (a implementação real por trás do type opaco definido na TASK-001).
2. **Builders**: `SelectQueryBuilder`/`InsertQueryBuilder`/`UpdateQueryBuilder`/`DeleteQueryBuilder` — cada `.where()`/`.orderBy()`/`.limit()`/`.offset()`/`.values()`/`.set()` acumula estado, e `.execute()` compila tudo pra um `CompiledQuery` (`{ sql, params }`) e chama o bridge da TASK-002.
3. **`QueryClient`**: o objeto raiz (`db`) com `select()`/`insert()`/`update()`/`delete()`/`transaction()`/`execute()` (raw).
4. **Geração de SQL parametrizado**: a parte central — transformar a árvore de `Condition`/builder state em `{ sql: string, params: unknown[] }` válido e seguro (sempre parametrizado, nunca interpolação de string pra evitar SQL injection mesmo que os valores venham só de dentro do app).

## Docs de referência

- **`docs/query-layer.md` — doc inteiro é a fonte primária deste subsistema.** Especial atenção a "Query Builder" (as interfaces exatas), "Operadores" (assinatura de cada função) e "Decisão: execução via SQL string + params" (por que a geração acontece aqui em JS, e por que isso é a opção mais performática — não reabrir essa decisão).
- `docs/project.md` → seção "Camada de Query (ORM)" — exemplo de uso end-to-end (`db.select(CustomerSchema).where(eq(...)).orderBy(...).limit(50).execute()` e `db.transaction(...)`), útil como teste de aceitação informal.
- `docs/mvp-scope.md` → linha "Tipo de `datetime`" — lembrete de que `datetime` é `number` (epoch millis) no TS, não `Date`, consistente em toda geração de SQL/binding de parâmetro.

## Critérios de aceite

- [ ] `db.select(Schema).where(eq(...)).orderBy(...).limit(n).offset(n).execute()` gera SQL parametrizado correto e retorna `InferSelectModel<TSchema>[]` tipado.
- [ ] `db.insert(Schema).values(row).execute()` aceita exatamente o shape de `InferInsertModel<TSchema>` (colunas opcionais/obrigatórias conforme `nullable`/`default`).
- [ ] `db.update(Schema).set(patch).where(...).execute()` e `db.delete(Schema).where(...).execute()` funcionam.
- [ ] `and`/`or`/`not` compõem condições aninhadas corretamente (teste com pelo menos 3 níveis de aninhamento).
- [ ] `db.transaction(async (tx) => { ... })` executa múltiplos writes atomicamente, com rollback automático se o callback lançar.
- [ ] `db.execute(sql, params)` (raw) funciona como escape hatch, sem type-safety, mas ainda parametrizado (nunca concatenar valor direto na string SQL).
- [ ] Nenhum caminho de geração de SQL usa interpolação de string pra valor de usuário — 100% via `params` — auditar isso explicitamente como item de review, é a superfície de risco de SQL injection do projeto.
- [ ] Testado (via harness da TASK-003) com um `execute()` mockado, sem depender de TASK-007 estar pronta pra validar a lógica de geração de SQL isoladamente.

## Fora de escopo

Relations/joins, agregações (`count`/`sum`/`avg`/`groupBy`), `ilike`/`between`/subqueries, `returning()` — todos fora do MVP (`docs/query-layer.md` seção "Fora do MVP"). Execução de fato do SQL (TASK-007, este builder só monta e chama a bridge).
