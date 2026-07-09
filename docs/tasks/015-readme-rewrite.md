# TASK-015 — Reescrever README.md

**Status:** ⬜ Não iniciado
**Prioridade:** P2 (pode esperar)
**Área:** Docs
**Depende de:** Nenhuma — pode começar imediatamente
**Bloqueia:** Nenhuma
**Paralelizável:** Sim, total — zero dependência, zero conflito com qualquer outra tarefa. Bom primeiro pick pra alguém novo no time.
**Skills obrigatórias:** — (docs, sem skill de domínio)

## Descrição

O `README.md` na raiz do repo ainda é o boilerplate genérico do template `react-native-nitro-template` — título errado ("react-native-nitro-template"), e descreve arquivos que nem existem no projeto (`cpp/HybridTestObjectCpp.cpp` é citado na seção "Structure" mas o diretório `cpp/` não existe ainda — só a infra de build pré-cabeada esperando ele). Isso é a primeira coisa que qualquer pessoa (dev novo, ou alguém de fora avaliando o projeto) vê ao abrir o repo, e hoje não reflete nada do projeto real.

Reescrever cobrindo:

1. **O que é o projeto** — puxar de `docs/project.md` (que já foi escrito exatamente pra isso: apresentar a ideia a um dev novo, só superfície MVP).
2. **Setup** — como instalar, rodar `npm run specs` (codegen), rodar o app de exemplo (se/quando existir um `example/` — hoje não existe, então documentar isso como próximo passo se for o caso).
3. **Estrutura do repo** — atualizada pra realidade atual: `docs/` (os 5 docs de arquitetura + `docs/tasks/`), `src/specs/` (specs Nitro conforme forem criados pela TASK-002), `cpp/`/`android/`/`ios/` (conforme forem populados pelas tarefas nativas). Não precisa enumerar arquivo por arquivo como o template fazia — referenciar `docs/project.md` pra detalhe.
4. **Link pros docs** — `docs/project.md` como ponto de entrada pra quem quer entender a arquitetura, `docs/tasks/README.md` pra quem quer pegar uma tarefa.

Esta tarefa pode ser feita a qualquer momento — mas fica mais completa (e é mais fácil de manter atualizada) se feita depois de pelo menos TASK-001/002 existirem, já que aí há algo de real em `src/` pra descrever além dos docs.

## Docs de referência

- `docs/project.md` — fonte primária pro conteúdo de apresentação do projeto.
- `README.md` atual — ler antes de reescrever, pra saber exatamente o que remover (é 100% boilerplate, nada do conteúdo atual é específico deste projeto).

## Critérios de aceite

- [ ] Título e descrição refletem o projeto real (Salve DB / Native Offline Database), não o template.
- [ ] Nenhuma referência a arquivo que não existe no repo (ex: `HybridTestObjectCpp.cpp`).
- [ ] Seção de setup com passos reais e testados (rodar os comandos descritos e confirmar que funcionam).
- [ ] Links pra `docs/project.md` e `docs/tasks/README.md`.
- [ ] Estrutura do repo descrita reflete o estado atual (não promete algo que ainda não foi implementado sem marcar como "planejado").

## Fora de escopo

Documentação de API detalhada (isso vive nos docs de `docs/`, o README é só a porta de entrada). CONTRIBUTING.md ou guia de contribuição extenso (fora do escopo desta tarefa, pode virar outra se necessário).
