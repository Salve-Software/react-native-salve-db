# Read-flow cache-first (alvo — ainda não implementado)

> **Status:** este doc descreve o comportamento alvo de leitura, decidido nesta rodada de discussão. Hoje `useQuery` só lê o SQLite local — não existe fetch inicial em banco vazio nem sync disparado por leitura implementados em nenhum lugar do código atual. Depende do motor de sync já falar o contrato descrito em [`sync-rest-contract.md`](./sync-rest-contract.md) (issue #84) — o mecanismo de disparo aqui é `triggerSync(schemaName)`, que é exatamente o que aquele doc especifica.

---

# Por que isso existe

Sem isso, uma tela que lê um schema sincronizável só mostra o que já está no SQLite — se o banco está vazio (primeira abertura do app, ou dado nunca chegou), a tela fica vazia pra sempre até algum outro gatilho (abertura do app, scheduler em background) rodar. E mesmo com o banco populado, os dados podem ficar velhos por muito tempo se nenhum outro gatilho passar por ali.

A leitura já é o melhor sinal de "isso importa agora" que existe — é literalmente o usuário olhando pra aquele dado nesse instante.

---

# O mecanismo — uma coisa só, não dois fluxos

O desenho original tinha dois branches (banco vazio → busca inicial; banco populado → cache + sync em background). Na prática, sob as decisões desta discussão, **é o mesmo mecanismo nos dois casos** — a diferença entre os branches é só a consequência natural de já ter ou não ter dado local pra mostrar, não dois códigos diferentes:

```text
useQuery(schema) monta ou re-renderiza
│
├─ schema.sync?.enabled === true?
│    não → nada acontece, comportamento de hoje
│
├─ sim → devolve IMEDIATAMENTE o que o SQLite tem agora
│         (array vazio se banco vazio, populado se não — sem esperar nada)
│
└─ em paralelo, silenciosamente, dispara triggerSync(schema.name)
     │
     ├─ throttle de 5s por schema já aberto (janela de outra leitura recente)?
     │    sim → não dispara, não faz nada
     │
     ├─ já tem uma sessão de sync rodando (por qualquer motivo — app-open,
     │  scheduler, outra leitura, chamada manual)?
     │    sim → descarta, não espera, não bloqueia a leitura
     │
     └─ não → dispara a sessão (push+pull normal, ver sync-rest-contract.md)
              merge acontece → UI re-renderiza sozinha, via a reatividade
              que já existe hoje (QueryCache + subscribeToChanges)
```

Não existe um "modo de primeira carga" com loading bloqueante. A leitura **nunca espera o sync** — sempre devolve o cache local na hora, mesmo que vazio, e o sync (se dispara) acontece inteiramente em segundo plano.

---

# Decisões

- **Sempre ligado, sem configuração.** Todo `useQuery` de um schema com `sync.enabled: true` se comporta assim — não existe prop pra desligar por tela nem flag global. Isso significa **zero mudança na API pública** do hook — `IUseQueryProps`/`IUseQueryResult` não ganham campo novo nenhum.
- **Throttle de 5s por schema**, leading-edge (dispara na primeira leitura, ignora as seguintes dentro da janela) — mesma semântica e valor já usados hoje no `SyncTriggerDebouncer` nativo (monitor de conectividade, `ios/Sync/SyncTriggerDebouncer.swift` / equivalente Kotlin), por consistência.
- **Escopo por schema** — ler `orders` só dispara sync de `orders`, nunca todos os schemas de uma vez (`triggerSyncAll`). Cada `useQuery` já é escopado a um schema; o gatilho segue esse mesmo escopo.
- **Descarta se já tem sync rodando, nunca espera.** A leitura não pode ficar refém de uma sessão de sync alheia (app-open, scheduler, outra leitura) que pode levar segundos. Se o motor já está ocupado, essa tentativa é descartada silenciosamente — tenta de novo na próxima leitura fora da janela de throttle.
- **Silencioso — sem sinal de UI.** Nenhum `isSyncing`/`isRefreshing` exposto pelo hook. A UI só percebe que algo mudou quando o merge realmente acontece e a reatividade existente dispara o re-render.

---

# O que isso exige do motor nativo

`triggerSync(schemaName)` (single-schema) hoje só tem uma variante que **sempre bloqueia** até o mutex global de sync liberar (`DatabaseManager::lockSync()`) — não existe hoje um jeito de pedir "tenta, mas não espera". Isso é incompatível com a decisão de nunca bloquear a leitura.

`triggerSyncAll` já resolve isso com um parâmetro `discardIfBusy` (usa `tryLockSync()` em vez de `lockSync()`, retorna vazio na hora se já tem sessão rodando). `triggerSync` (schema único) precisa ganhar a mesma variante:

```cpp
// cpp/sync/SyncOrchestrator.hpp — hoje
NativeSyncResult triggerSync(const std::string& schemaName);

// alvo
std::optional<NativeSyncResult> triggerSync(const std::string& schemaName, bool discardIfBusy);
```

`discardIfBusy=false` continua sendo o que `Database.sync(schemaName)` (chamada manual) usa — ali faz sentido esperar. `discardIfBusy=true` é o que o gatilho de leitura usa.

Isso precisa de uma mudança no spec Nitro (`src/specs/SalveDatabase.nitro.ts`) — `triggerSync` ganha o segundo parâmetro, o retorno vira `NativeSyncResult | undefined` (`undefined` = descartado). `Database.sync()` (TS) continua com a mesma assinatura pública de hoje — internamente sempre chama com `discardIfBusy: false`, então nunca vê `undefined`.

---

# O que já reaproveita sem mudança

- **Reatividade da UI** — `QueryCache`/`subscribeToChanges` já re-renderizam automaticamente qualquer tela cujo schema mudou, não importa a origem da escrita (sync, outra tela, o quê). Zero trabalho novo aqui.
- **A sessão de sync em si** — `triggerSync(schemaName, discardIfBusy)` dispara exatamente a mesma sessão push-então-pull de `sync-rest-contract.md`. Não existe uma variante "só pull" pro caso de leitura — mesmo mecanismo, sempre.
- **`registerAppOpenSync.ts`** — mesmo padrão de módulo (estado no nível do módulo, gatilho fire-and-forget com `.catch()`) é o template estrutural pro novo módulo de throttle por schema.

---

# Fora de escopo

- Qualquer sinal de progresso/loading pra UI (decisão explícita: silencioso).
- Configuração por query/schema pra desligar o comportamento.
- Sincronizar todos os schemas de uma vez a partir de uma leitura (`triggerSyncAll`).

---

# Rastreamento

Trabalho rastreado em **#85**, que depende de **#84** (o motor de sync) estar implementado primeiro — `triggerSync(schemaName, discardIfBusy)` é uma mudança na mesma superfície nativa que #84 reescreve.
