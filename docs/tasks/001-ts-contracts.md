# TASK-001 — Contratos TypeScript

**Status:** ✅ Finalizado
**Prioridade:** P0 (bloqueante)
**Área:** TS
**Depende de:** Nenhuma — pode começar imediatamente
**Bloqueia:** TASK-002, TASK-004 a TASK-014 (praticamente todas — todo lado nativo e TS referencia estes types)
**Paralelizável:** Sim — é o primeiro pick de qualquer pessoa entrando no projeto
**Skills obrigatórias:** `api-design`

## Antes de começar

Invoque a skill `api-design` antes de escrever qualquer arquivo — ela define convenções de naming, forma de options objects, e como estruturar exports de uma lib TS/JS que esta tarefa precisa seguir.

## Descrição

Esta tarefa não escreve lógica nenhuma — só os `interface`/`type` do TypeScript que todo o resto do projeto (nativo e TS) vai importar e implementar contra. É o "esqueleto" que faz o resto do time trabalhar em paralelo sem esperar um pelo outro: uma vez que os types existem, quem for implementar o Nitro spec (TASK-002), o Query Builder (TASK-013) ou o core C++ (TASK-004+) já sabe exatamente a forma dos dados que vai receber/devolver, mesmo que a implementação real de outra tarefa ainda não exista.

Cubra dois grupos de contrato, ambos já 100% especificados nos docs — esta tarefa é transcrição fiel pra `.ts` real, não design novo:

1. **Contrato de sync** (`docs/architecture.md`, do topo até o fim): `HttpMethod`, `SyncDirection`, `SyncStrategy`, `ConflictStrategy`, `AuthStrategy`, `Transport`, `AuthProvider`, `SchemaDefinition<TEntity>`, `ColumnDefinition`, `IndexDefinition`, `SyncDefinition<TEntity>`, `EndpointDefinition`, `AuthenticationDefinition`, `DatabaseConfigDefinition`, `CredentialsDefinition`, `BackgroundDefinition`, `PaginationDefinition`, `RequestDefinition<TEntity>`, `ResponseDefinition<TEntity>`, `RequestExpression` (+ `VariableExpression`/`ConstantExpression`/`ObjectExpression`/`ArrayExpression`), `JsonPath`, `SyncOperation`, `NativeSyncResult`, `RetryDefinition`, `CompressionDefinition`, `EncryptionDefinition`.
2. **Contrato de query/ORM** (`docs/query-layer.md`): `CompiledQuery`, `InferSelectModel<TSchema>`, `InferInsertModel<TSchema>` (e o `ColumnTsType` mapper auxiliar que elas usam), `Condition` + as funções `eq`/`ne`/`gt`/`gte`/`lt`/`lte`/`like`/`inArray`/`isNull`/`isNotNull`/`and`/`or`/`not` (assinatura apenas — implementação é da TASK-013), `QueryClient`, `SelectQueryBuilder`/`InsertQueryBuilder`/`UpdateQueryBuilder`/`DeleteQueryBuilder`.

Onde `mvp-scope.md` já restringiu uma union pra 1 membro fixo no MVP (ex: `SyncStrategy = "operations" | "incremental" | "full"` em `architecture.md`, mas MVP só usa `"operations"`), mantenha a union completa como está em `architecture.md`/`query-layer.md` — os comentários `// MVP:` já documentados ali indicam o subset ativo. Não remova os membros reservados, eles são o motivo da union já existir (crescer sem quebrar).

## Docs de referência

- `docs/architecture.md` — doc inteiro é a fonte primária deste contrato (já em blocos ` ```ts ` prontos pra colar, com os comentários `// MVP:` já aplicados).
- `docs/query-layer.md` → seções "Inferência de tipos", "Operadores (condições de `where`)" e "Query Builder" — mesma coisa, blocos `ts` prontos.
- `docs/mvp-scope.md` → seção "Contrato mínimo (MVP)" — versão já reduzida do `SyncDefinition`/`PaginationDefinition`, útil pra conferir que nada do MVP ficou de fora.

## Critérios de aceite

- [x] Todo type/interface listado acima existe em `.ts` real dentro de `src/`, organizado em arquivos por domínio (ex: `sync-contracts.ts`, `query-contracts.ts`, `schema-contracts.ts`) — não um único arquivo gigante, e sem virar barrel file (convenção de `.agents/skills/build-nitro-modules/references/spec-hybrid-object.md`).
- [x] `npm run typecheck` passa sem erro.
- [x] Nenhum `any` implícito ou explícito nos types públicos.
- [x] Os comentários `// MVP:` de `architecture.md` foram preservados como JSDoc nos arquivos `.ts` (documentação, não só no doc markdown).
- [x] `InferSelectModel`/`InferInsertModel` testados manualmente contra o `CustomerSchema` de exemplo de `docs/project.md` — o tipo inferido bate com o esperado (checar via `// @ts-expect-error` ou type-level test).

## Fora de escopo

Nenhuma lógica de runtime (nada de `function eq(...) { ... }` implementado — só a assinatura de tipo). Nenhuma implementação de Nitro HybridObject (isso é TASK-002). Nenhum arquivo `.nitro.ts` (nitrogen só faz codegen em cima de arquivos com esse sufixo específico — os types desta tarefa são "puro TS" consumidos por quem for escrever o spec).
