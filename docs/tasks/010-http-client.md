# TASK-010 — HTTP Client (Android+iOS)

**Status:** ⬜ Não iniciado
**Prioridade:** P1 (núcleo do MVP)
**Área:** Android+iOS
**Depende de:** TASK-002
**Bloqueia:** TASK-009 (chamada de refresh), TASK-012 (chamada de sync)
**Paralelizável:** Sim, total — não depende de nenhuma peça do core C++, só do spec da bridge (TASK-002). Bom candidato pra pegar bem cedo.
**Skills obrigatórias:** `kotlin`, `swift`

## Antes de começar

Invoque `kotlin` (OkHttp ou `HttpURLConnection` — decidir e documentar qual, atentar a threading/coroutines) e `swift` (`URLSession`, `async`/`await`). Cruza os dois domínios, mesmo sendo cada metade relativamente simples.

## Descrição

Cliente HTTP nativo por plataforma — decisão desta sessão de planejamento: **não** é C++ compartilhado (ao contrário do resto do core), porque integra melhor com cert store do SO, proxy, e não traz dependência extra tipo libcurl pro bundle. Mesmo assim, ele expõe uma interface fina que o core C++ (TASK-012, TASK-009) chama via callback/JSI — do ponto de vista do orchestrator, "fazer um request HTTP" é uma função só, a implementação por trás é que é nativa-por-plataforma.

Escopo do MVP, **REST apenas** (`transport: "rest"` é a única opção implementada — `graphql`/`grpc` existem no type mas não são suportados, `mvp-scope.md`):

1. Executar request (`method`, `path` relativo a `baseUrl`, `headers`, `body`) e devolver `(status, body, headers)`.
2. `baseUrl` + `path` → URL final (`docs/overview.md` já documenta a concatenação simples: `baseUrl + path`).
3. Timeout configurável via `DatabaseConfigDefinition.network.timeout`.
4. Erro de rede (sem conexão, timeout) precisa ser distinguível de erro HTTP (4xx/5xx) por quem chama — o Sync Orchestrator (TASK-012) trata isso diferente (retry vs falha definitiva).

## Docs de referência

- `docs/architecture.md` → seção "Endpoint" (`EndpointDefinition`: `method`, `path`, `headers`) — o shape do que este cliente recebe como entrada.
- `docs/overview.md` → seção "Base URL" — regra de concatenação `baseUrl + path`.
- `docs/mvp-scope.md` → linha "Transport" — confirma REST-only no MVP e por quê.
- `docs/architecture.md` → `DatabaseConfigDefinition.network.timeout` (dentro de "Database Config (global)") — de onde vem o timeout configurável.

## Critérios de aceite

- [ ] `GET`/`POST`/`PUT`/`PATCH`/`DELETE` funcionando nas duas plataformas.
- [ ] `baseUrl` + `path` concatenados corretamente (incluindo casos de barra duplicada/faltando, normalizados).
- [ ] Timeout de `network.timeout` respeitado — teste contra um endpoint lento/simulado.
- [ ] Erro de rede (sem conexão) e erro HTTP (ex: 500) chegam como tipos de erro distintos pra quem chamou.
- [ ] Headers customizados (`EndpointDefinition.headers`) e o header de auth (injetado pela TASK-009) coexistem sem um sobrescrever o outro incorretamente.
- [ ] Body de request/response tratado como JSON (serialização/deserialização), consistente com o formato que a TASK-008 (interpretador de expressões) produz/consome.

## Fora de escopo

Decidir o conteúdo do body ou como extrair da response (isso é TASK-008). Retry (fixo, 3 tentativas/5s — implementado na TASK-012, este cliente só executa uma tentativa por chamada, quem decide repetir é o orchestrator). Suporte a `graphql`/`grpc` (fora do MVP).
