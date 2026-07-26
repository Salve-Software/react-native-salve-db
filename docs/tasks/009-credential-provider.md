# TASK-009 — Credential Provider (Android+iOS)

**Status:** 🟡 Em andamento
**Prioridade:** P1 (núcleo do MVP)
**Área:** Android+iOS
**Depende de:** TASK-002, TASK-008
**Bloqueia:** TASK-012
**Paralelizável:** Sim, em relação ao core C++ (TASK-004 a 007) e às outras tarefas de plataforma (TASK-010/011) — arquivos diferentes, sem overlap.
**Skills obrigatórias:** `kotlin`, `swift`

## Antes de começar

Invoque `kotlin` pro lado Android (Keystore API, coroutines pro fluxo assíncrono de refresh) e `swift` pro lado iOS (Keychain via Security framework, `async`/`await` pro mesmo fluxo). É uma tarefa que cruza os dois domínios — não pule nenhuma das duas skills achando que "é só a metade que estou implementando agora".

## Descrição

Armazenamento de credencial é responsabilidade exclusiva da camada nativa — o JS nunca vê o token nem participa do fluxo de refresh (`docs/overview.md`/`docs/project.md`). Esta tarefa implementa isso nas duas plataformas:

1. **Armazenamento**: salvar/ler `accessToken`/`refreshToken` no Keychain (iOS) / Keystore (Android). Credencial é **única e global** por app no MVP (decisão em `mvp-scope.md`) — não existe override por schema, então isso é um único par de token por instalação do app, não por endpoint.
2. **Injeção no request**: todo request de sync (feito pela TASK-012 via HTTP Client da TASK-010) precisa do `accessToken` atual injetado no header configurado (`CredentialsDefinition.accessToken.headerName`, default `"Authorization"`).
3. **Fluxo de refresh 100% nativo**: interceptar resposta `401` de qualquer request de sync, montar o request de refresh usando o Interpretador de Expressões da TASK-008 (o contrato `CredentialsDefinition.refresh` usa a mesma forma de `RequestExpression`/`JsonPath` do resto do sistema), chamar `refresh.endpoint` via HTTP Client (TASK-010), salvar os novos tokens, e reexecutar a requisição original que tinha falhado.

Fluxo completo, já documentado em `project.md`:

```text
Sync → Access Token → 401? → Refresh Token → salva novos tokens → reexecuta requisição
```

## Docs de referência

- `docs/project.md` → seção "Configuração global e credenciais" — prosa completa do fluxo, incluindo o diagrama acima.
- `docs/architecture.md` → seções "Database Config (global)" e "Credentials" — os types `DatabaseConfigDefinition`/`CredentialsDefinition` exatos (já implementados na TASK-001) que esta tarefa consome.
- `docs/mvp-scope.md` → linhas "Auth" e "Auth scope" na tabela de decisões — confirma que é credencial única/global, sem override por schema, e por que (era uma inconsistência entre `overview.md` e `architecture.md` original, resolvida nesta sessão).

## Critérios de aceite

- [ ] Token salvo/lido corretamente do Keychain (iOS) e Keystore (Android) — teste manual ou instrumentado confirmando que sobrevive a restart do app. Lógica implementada (`ios/SalveDbPlatform.mm` via Security framework, `android/.../SalveDbSecureStorage.kt` via `EncryptedSharedPreferences`/Keystore) e coberta no host contra um test double (`cpp/tests/support/platform_test.cpp`); falta verificação em dispositivo/simulador real.
- [x] Header de auth injetado automaticamente em request de sync, usando `headerName` configurado (default `"Authorization"`) — `CredentialProvider::getAuthHeader()`, testado.
- [ ] Simular resposta `401` dispara o fluxo de refresh automaticamente, sem intervenção do JS. Mecanismo pronto (`CredentialProvider::refresh(HttpCaller)`, injeta a chamada HTTP já que TASK-010 não existe ainda) e testado isoladamente; falta o Sync Orchestrator (TASK-012) chamá-lo de fato na resposta 401 real.
- [ ] Requisição original é reexecutada com sucesso após refresh bem-sucedido — depende de TASK-010 (HTTP Client) existir; fora do alcance desta tarefa isoladamente.
- [x] Refresh que falha (ex: `refreshToken` também expirado/inválido) propaga um erro claro até o Sync Orchestrator (TASK-012), não trava silenciosamente — testado (status não-2xx, JsonPath ausente na resposta).
- [x] Nenhum token (access ou refresh) atravessa a JSI bridge pro lado JS em nenhum momento — `CredentialProvider` é C++ puro, sem `JSIConverter`; o único ponto de contato com JSI é o seed inicial em `configure()` (ver nota de escopo abaixo).

## Nota de escopo (achado durante implementação)

O contrato `CredentialsDefinition`/`CredentialsParams` (TASK-001) não tinha campo nenhum pro par de tokens inicial, apesar de "Fora de escopo" abaixo sempre ter descrito que "o token inicial chega via `configure()`". Adicionado `credentials.tokens?: { accessToken, refreshToken }` em `ICredentialsDefinition`/`ConfigureParams`/`docs/architecture.md` (`CredentialsDefinition`) pra fechar esse gap — só passa pela bridge uma vez, no seed; depois disso o token só existe nativamente. Corpo do request de refresh é fixo (`{"refreshToken": "<valor>"}`), não usa o Interpretador de Expressões da TASK-008 pra montá-lo — ver correção de escopo já registrada no comentário da issue #10 (débito documentado em #50).

## Fora de escopo

Fazer a chamada HTTP em si (usa o HTTP Client da TASK-010, não reimplementa). Decidir quando uma sync deve ocorrer (TASK-012/TASK-011). UI de login/obtenção do token inicial (fora do MVP — o token inicial chega via `configure()`, de onde o app já o obteve por fora, ex: tela de login própria do app consumidor da lib).
