# TASK-002 — Nitro HybridObject Spec (bridge JS↔nativo)

**Status:** ⬜ Não iniciado
**Prioridade:** P0 (bloqueante)
**Área:** TS
**Depende de:** TASK-001
**Bloqueia:** TASK-004 a TASK-014 (todo lado nativo implementa contra este spec; todo lado TS chama através dele)
**Paralelizável:** Não em relação a TASK-001 (precisa dos types prontos primeiro); depois disso, sim.
**Skills obrigatórias:** `build-nitro-modules`, `api-design`

## Antes de começar

Invoque `build-nitro-modules` — ela documenta a convenção exata de `.nitro.ts` (nomear o arquivo pelo domínio, não `Example.nitro.ts`; `export interface Foo extends HybridObject<{ ios: 'swift'|'c++'; android: 'kotlin'|'c++' }>`; nitrogen só parseia arquivos terminados em `.nitro.ts`; runtime criado via `NitroModules.createHybridObject<Foo>('Foo')` com a chave batendo em `nitro.json`). Invoque também `api-design` — este spec é, na prática, a API pública que todo o resto do projeto consome.

## Descrição

Hoje `src/specs/Example.nitro.ts` e `src/index.ts` estão vazios (o stub genérico do template já foi removido, sem nada no lugar) e `nitro.json` tem `"autolinking": {}` — zero HybridObject registrado. Esta tarefa define a superfície JSI real: os métodos que o C++ compartilhado (decisão desta sessão: core em C++, não Swift/Kotlin duplicado) precisa expor pro JS chamar, e que o JS (Query Builder da TASK-013, Public API da TASK-014) vai chamar.

Desenhe pelo menos estes HybridObjects (nomes sugestivos, a tarefa decide os nomes finais seguindo a convenção de `build-nitro-modules`):

- **Database bridge**: `configure(config: DatabaseConfigDefinition): void`, `registerSchema(schema: SchemaDefinition<any>): Promise<void>` (aciona Migration Engine da TASK-005 do lado nativo).
- **Query bridge**: `execute(compiled: CompiledQuery): Promise<unknown[]>` (chama o Query Executor da TASK-007), pensando já na assinatura de transação (`beginTransaction`/`commit`/`rollback` ou um `runInTransaction` que recebe múltiplos `CompiledQuery` — decidir o formato mais simples de marshaling via JSI, documentar a escolha no próprio arquivo).
- **Sync bridge**: `triggerSync(schemaName: string): Promise<NativeSyncResult>` (sync manual/on-open — chama o Sync Orchestrator da TASK-012).

Cada método precisa ter tipos de entrada/saída batendo exatamente com os contratos da TASK-001 — não redeclare shapes ad-hoc aqui.

Depois de desenhar os specs, rode `npm run specs` (script já existe em `package.json`: `tsc --noEmit false && nitrogen --logLevel=debug`) pra confirmar que o codegen roda sem erro e gera `nitrogen/generated/` (hoje esse diretório não existe — é esperado que passe a existir após esta tarefa). Preencha as entradas correspondentes em `nitro.json` → `autolinking`.

## Docs de referência

- `docs/project.md` → seção "Arquitetura" (diagrama) — lista os componentes nativos que este spec precisa dar superfície pra JS acionar.
- `docs/query-layer.md` → seção "Decisão: execução via SQL string + params" — a razão de `execute` receber `{ sql, params }` já compilado em vez de um AST, e por que isso é o formato mais performático de marshaling.
- `.agents/skills/build-nitro-modules/references/spec-hybrid-object.md` (arquivo já presente no repo, carregado pela skill) — convenção exata de como escrever o `.nitro.ts`.

## Critérios de aceite

- [ ] Pelo menos os 3 HybridObjects descritos acima existem como arquivos `*.nitro.ts` em `src/specs/`, nomeados por domínio.
- [ ] `nitro.json` → `autolinking` tem uma entrada por HybridObject.
- [ ] `npm run specs` roda sem erro e popula `nitrogen/generated/{android,ios}`.
- [ ] `src/index.ts` exporta os HybridObjects criados via `NitroModules.createHybridObject<T>(...)`.
- [ ] Toda assinatura de método usa tipos importados da TASK-001, zero shape duplicado/redeclarado.
- [ ] `android/CMakeLists.txt`/`NitroSalveDb.podspec` continuam buildando (nem que seja só o wiring gerado, sem implementação nativa ainda — isso é das tarefas seguintes).

## Fora de escopo

Nenhuma implementação nativa (C++/Kotlin/Swift) dos métodos — isso é TASK-004 em diante. Nenhuma lógica de query builder ou sync orchestrator do lado JS (TASK-012/013/014 consomem este spec, não o definem).
