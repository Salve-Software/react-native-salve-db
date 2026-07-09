# TASK-014 — Public API: `Database.configure()` / `Database.register()`

**Status:** ⬜ Não iniciado
**Prioridade:** P1 (núcleo do MVP)
**Área:** TS
**Depende de:** TASK-001, TASK-002, TASK-005, TASK-009
**Bloqueia:** Nenhuma diretamente — é o ponto de entrada final, integra o que já existe.
**Paralelizável:** Parcial — a validação/shape da API pode ser desenhada em paralelo com o core, mas o critério de aceite real (registrar um schema de verdade) só fecha depois de TASK-005 e TASK-009 existirem.
**Skills obrigatórias:** `api-design`, `build-nitro-modules`

## Antes de começar

Invoque `api-design` (é a primeira coisa que qualquer dev consumidor da lib chama — a experiência de erro de validação aqui define a primeira impressão da lib inteira) e `build-nitro-modules` (esta tarefa é quem efetivamente instancia e chama os HybridObjects definidos na TASK-002 pela primeira vez em uso real, não só em teste isolado).

## Descrição

O ponto de entrada que o app consumidor chama uma única vez na inicialização:

```ts
Database.configure({ baseUrl, network, credentials })
Database.register({ schema: CustomerSchema })
```

Responsabilidades:

1. **`Database.configure(config: DatabaseConfigDefinition)`**: valida o shape do config (erro claro e cedo se `baseUrl` ausente, `credentials.provider` inválido, etc — não deixar isso estourar só na primeira sync, horas depois), serializa e manda pro nativo via bridge (TASK-002): `baseUrl`/`network` vão pra um estado de config nativo simples; `credentials` vai especificamente pro Credential Provider (TASK-009), que é quem efetivamente grava no Keychain/Keystore.
2. **`Database.register({ schema })`**: valida o `SchemaDefinition` (nome único, `primaryKey` existe em `columns`, etc), serializa e chama `registerSchema` da bridge (TASK-002), que aciona a Migration Engine (TASK-005) do lado nativo — criação/migração de tabela, e (se `sync.enabled`) criação das triggers (TASK-006, já acionado internamente pela própria TASK-005/006 na cadeia nativa).
3. Expor esses dois como a API pública de topo do pacote (`src/index.ts`), junto com o `db` (`QueryClient`) construído na TASK-013.

## Docs de referência

- `docs/project.md` → seção "Arquitetura" — o diagrama mostrando `Database.configure()`/`Database.register()` como os dois únicos pontos de entrada que tocam JS antes de tudo virar nativo.
- `docs/project.md` → seção "Configuração global e credenciais" — exemplo completo de `Database.configure(...)`, incluindo o bloco `credentials` inteiro.
- `docs/architecture.md` → "Database Config (global)" e "Schema Contract" — os types exatos validados/serializados aqui (já implementados na TASK-001).

## Critérios de aceite

- [ ] `Database.configure(config)` com config válido resulta em credenciais salvas nativamente (via TASK-009) e `baseUrl`/`network` disponíveis pro resto do sistema.
- [ ] `Database.configure(config)` com config inválido (`baseUrl` ausente, provider desconhecido) falha com erro claro e específico, síncrono/cedo — não silenciosamente aceito.
- [ ] `Database.register({ schema })` com schema válido resulta em tabela criada/migrada (via TASK-005) e, se `sync.enabled`, triggers criadas (via TASK-006).
- [ ] `Database.register` chamado duas vezes com o mesmo `name` de schema mas `version` diferente aciona migration corretamente (delega pra TASK-005, mas o critério de aceite aqui é que a chamada JS->nativo carrega essa mudança de forma íntegra).
- [ ] Chamar `Database.register` **antes** de `Database.configure` resulta em erro claro (ordem importa — documentar e validar), não em comportamento indefinido.
- [ ] `src/index.ts` exporta `Database` (com `configure`/`register`) e `db` (o `QueryClient` da TASK-013) como a superfície pública do pacote.

## Fora de escopo

Validação de `sync` em si além do shape básico (a lógica de sync roda inteiramente nativa — TASK-012). UI ou fluxo de obtenção do token inicial (o app consumidor já traz o token pronto pra dentro do `credentials` do `configure()`).
