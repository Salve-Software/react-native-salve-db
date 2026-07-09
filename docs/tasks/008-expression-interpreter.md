# TASK-008 — Interpretador de Expressões Declarativas (C++)

**Status:** ⬜ Não iniciado
**Prioridade:** P1 (núcleo do MVP)
**Área:** C++ (core)
**Depende de:** TASK-004 (lógica pura de avaliação de expressão pode começar antes disso estar 100% pronto; integração real com `$ref: "cursor"`/`$ref: "operations"` depende de TASK-006 existir, pois esses refs leem `sync_queue`/cursor armazenado)
**Bloqueia:** TASK-009 (refresh de credencial usa isto), TASK-012 (sync usa isto pra montar request/interpretar response)
**Paralelizável:** Sim, em relação a TASK-005/006/007 — é lógica isolada, quase sem overlap de arquivo. Coordenar apenas o ponto de integração final com TASK-006 (quem implementa `$ref: "cursor"`/`"operations"` precisa saber onde a TASK-006 guarda esses dados).
**Skills obrigatórias:** `cpp`

## Antes de começar

Invoque `cpp` — este componente é essencialmente um interpretador de árvore (`std::variant`/visitor pattern encaixa bem pra `RequestExpression`), e não deve depender de estado externo além do que é passado explicitamente (facilita reuso entre TASK-009 e TASK-012).

## Descrição

O contrato de sync (`SyncDefinition.request`/`response`) e o contrato de refresh de credencial (`CredentialsDefinition.refresh`) são ambos declarativos — nenhuma função JS os interpreta, é o "Native Engine" quem entende essas expressões (`docs/overview.md`: "O Native Engine interpreta esse contrato"). Esta tarefa implementa esse interpretador uma única vez, compartilhado pelos dois consumidores (TASK-009 e TASK-012) — sem isso, cada um reimplementaria a mesma lógica de avaliação de `$ref`/`JsonPath` separadamente.

Duas direções:

1. **Montar request body** a partir de `RequestDefinition.body: Record<string, RequestExpression>`: avaliar `VariableExpression` (`$ref: "cursor" | "operations" | "pageSize" | "changes" | "deviceId" | "platform" | "timestamp" | "userId"` — no MVP, só `cursor`/`operations`/`pageSize` têm fonte de dado real implementada, os demais existem no type mas não são alimentados ainda, ver `mvp-scope.md`), `ConstantExpression` (`{ value }` literal), `ObjectExpression` (objeto aninhado, cada campo é outra `RequestExpression`), `ArrayExpression` (array de expressões). O resultado é um JSON pronto pra virar body HTTP.
2. **Extrair valores da response** via `JsonPath` (`docs/architecture.md` → "JSON Path": strings tipo `$.cursor`, `$.hasMore`, `$.data.items` — MVP não precisa de um parser JSONPath completo, só o subset simples usado nos exemplos: acesso por chave separado por `.`, sem array indexing/wildcards).

Onde a fonte do valor de um `$ref` vem: `cursor` e `pageSize` vêm de configuração/estado do schema (cursor persistido, pageSize de `PaginationDefinition`); `operations` vem de uma leitura da `sync_queue` (TASK-006) já serializada no formato `SyncOperation[]`; `refreshToken` (usado só no fluxo de credenciais, TASK-009) vem do token armazenado no Keychain/Keystore.

## Docs de referência

- `docs/architecture.md` → seções "Request Expressions" (todo o bloco: `RequestExpression`, `VariableExpression`, `ConstantExpression`, `ObjectExpression`, `ArrayExpression`) e "JSON Path" — contrato exato de entrada/saída.
- `docs/mvp-scope.md` → linha "Request `$ref` vars" — confirma que só `cursor`/`operations`/`pageSize` precisam de fonte de dado real no MVP; os demais (`deviceId`, `platform`, `timestamp`, `userId`, `changes`) ficam no type mas sem implementação (se avaliados, devem resultar em erro claro, não valor `undefined` silencioso).
- `docs/architecture.md` → seção "Credentials" (logo após "Database Config (global)") — o outro consumidor deste interpretador, mostra que `refresh.request`/`refresh.response` usam a mesma forma de `RequestExpression`/`JsonPath`.

## Critérios de aceite

- [ ] Avaliação de `ConstantExpression`, `ObjectExpression` (aninhado, múltiplos níveis) e `ArrayExpression` testada isoladamente, sem depender de `sync_queue` real.
- [ ] `$ref: "cursor"` e `$ref: "pageSize"` resolvidos corretamente a partir do estado/config do schema.
- [ ] `$ref: "operations"` resolvido a partir de uma leitura real da `sync_queue` (integração com TASK-006), respeitando o limite de `pageSize` (a paginação em si — decidir quantas operações pegar — é orquestrada pela TASK-012, mas a leitura/serialização usada por este `$ref` já precisa suportar receber um limite).
- [ ] `$ref` não implementado no MVP (`deviceId`/`platform`/`timestamp`/`userId`/`changes`) resulta em erro explícito e claro se referenciado, não em `null`/`undefined` silencioso.
- [ ] Extração de `JsonPath` simples (`$.cursor`, `$.hasMore`, `$.data.items`) testada contra JSON de exemplo, incluindo o caso de path ausente na response (retorna ausência de forma explícita, não crash).
- [ ] Reutilizado sem modificação pela TASK-009 (fluxo de refresh) — nenhuma lógica específica de sync "vaza" pra dentro deste interpretador (ele é genérico).

## Fora de escopo

Fazer a chamada HTTP em si (TASK-010). Decidir quando disparar sync ou refresh (TASK-012/TASK-009). Parser JSONPath completo com wildcards/array indexing (fora do MVP — só o subset simples documentado).
