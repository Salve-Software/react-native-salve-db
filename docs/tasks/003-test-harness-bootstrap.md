# TASK-003 — Bootstrap de test harness

**Status:** ⬜ Não iniciado
**Prioridade:** P1 (núcleo do MVP)
**Área:** Tooling
**Depende de:** Nenhuma — pode começar imediatamente
**Bloqueia:** Nenhuma diretamente, mas toda tarefa que escreve teste (praticamente todas) fica mais fácil depois desta existir.
**Paralelizável:** Sim — total, roda em paralelo com qualquer outra tarefa.
**Skills obrigatórias:** — (tooling, sem skill de domínio específica)

## Descrição

Hoje não existe absolutamente nenhum test runner no repo: sem jest, sem `__tests__/`, sem `*.test.ts`, sem `"jest"` em `package.json`, sem harness nativo documentado. Antes de qualquer tarefa (TS ou nativa) começar a produzir teste de verdade, alguém precisa decidir e configurar isso uma vez, senão cada tarefa reinventa a própria convenção.

Escopo:

1. **Lado TS**: configurar Jest (ou Vitest, se preferir — decidir e documentar o porquê) pra rodar contra `src/`. Vai ser usado principalmente pela TASK-001 (type-level tests dos `Infer*Model`), TASK-013 (Query Builder — testável isolado com um `execute()` mockado) e TASK-014. Adicionar script `test` em `package.json` (hoje não existe).
2. **Lado nativo**: não precisa implementar teste nativo nesta tarefa (não há nada pra testar ainda), mas documentar a convenção que as tarefas C++ (TASK-004 a TASK-008, TASK-012) e as tarefas Android+iOS (TASK-009 a TASK-011) devem seguir — provavelmente GoogleTest ou Catch2 pro C++ compartilhado (perguntar/decidir na skill `cpp`), JUnit pro lado Android, XCTest pro lado iOS. Registrar essa convenção como um doc curto (`docs/tasks/testing-conventions.md` ou seção deste próprio arquivo) pra outras tarefas linkarem no critério de aceite delas.

## Docs de referência

- Nenhum doc de arquitetura é necessário aqui — é puramente tooling. Consultar `package.json` atual (scripts existentes: `typecheck`, `lint`, `specs`) pra manter consistência de convenção de scripts npm.

## Critérios de aceite

- [ ] Jest (ou Vitest) configurado e rodando contra `src/`, com script `npm test` funcional em `package.json`.
- [ ] Pelo menos um teste de exemplo trivial passando (smoke test), pra provar que o harness realmente executa.
- [ ] Convenção de teste nativo (framework por plataforma + onde os arquivos de teste devem morar em `android/`/`ios/`/futuro `cpp/`) documentada em texto, referenciável pelas outras tarefas.
- [ ] `npm run lint`/`npm run typecheck` continuam passando após a mudança (garantir que config de jest/eslint não colidem).

## Fora de escopo

Não escrever testes de verdade pras outras tarefas (isso é responsabilidade de cada tarefa, no critério de aceite dela). Não configurar CI/pipeline (fora do MVP de docs desta sessão — pode virar tarefa futura se necessário).
