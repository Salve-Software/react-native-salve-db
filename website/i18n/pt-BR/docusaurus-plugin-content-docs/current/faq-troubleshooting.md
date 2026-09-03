---
title: FAQ & Troubleshooting
---

## Por que minha query lança um erro sobre índice ausente?

`select()`, `update()`, `delete()`, e `count()` executam `assertIndexedColumns()` antes de rodar:
toda coluna referenciada em `.where()` (e, para `select()`, `.orderBy()`) precisa ser a
`primaryKey` do schema ou a **coluna líder** de uma entrada declarada em `indexes`. Isso é
verificado de forma síncrona, no momento da chamada — não é um aviso de lint.

```ts
// lança: "Synchronous execute() requires an index covering column \"email\" as its
// leading column (schema \"users\"). Declare it in schema.indexes, or remove it from
// where()/orderBy()."
Database.select(UserSchema).where(eq('email', 'a@b.com')).execute();
```

Corrija adicionando um índice cuja primeira coluna seja aquela pela qual você filtra/ordena:

```ts
indexes: [{ name: 'idx_users_email', columns: ['email'] }],
```

Um índice composto só satisfaz a regra para sua **primeira** coluna — `columns: ['a', 'b']` cobre
queries que filtram por `a`, não queries que filtram apenas por `b`. Veja
[Schemas](./guides/schemas.md) para como declarar índices.

## Por que minha chamada `currentUser()` lançou um erro?

`currentUser()` lança `"currentUser(): no user set — call Database.setCurrentUser() first"` se
nenhum id de usuário foi registrado ainda. Ele falha alto deliberadamente em vez de retornar
`null` — um `null` compilaria silenciosamente para `WHERE col = NULL`, correspondendo a zero
linhas sem nunca explicar o motivo.

Duas causas comuns:

1. **`Database.setCurrentUser(id)` nunca foi chamado.** Chame-o logo depois que o próprio fluxo de
   login do seu app resolver o id do usuário.
2. **O app deu um cold start e `setCurrentUser` não foi chamado novamente.** O id do usuário atual
   vive apenas em memória — ele *não* é persistido entre reinicializações do app (diferente dos
   tokens de credenciais, que ficam armazenados no Keychain/Keystore). Chame
   `Database.setCurrentUser(id)` novamente assim que o próprio estado de sessão/auth do seu app for
   reidratado, antes de qualquer caminho de código que chame `currentUser()`.

`Database.getCurrentUser()` é o equivalente que não lança erro — retorna o id ou `null` — útil para
bloquear a UI sem disparar o erro. Veja [Operadores & Tipos](./api-reference/operators-types.md#usuário-atual).

## O sync em background nunca dispara no iOS

O sync em background (`BGTaskScheduler`) exige entitlements explícitos no app hospedeiro — o Salve
DB não pode registrá-los por você, e **o scheduler nativo não lança nem loga um erro em runtime se
estiverem ausentes; o job simplesmente nunca é agendado.** Verifique ambos:

**`Info.plist`** — o identificador de task usado internamente, mais o modo de background
`processing`:

```xml
<key>BGTaskSchedulerPermittedIdentifiers</key>
<array>
  <string>com.salvedb.background.sync</string>
</array>
<key>UIBackgroundModes</key>
<array>
  <string>processing</string>
</array>
```

**`*.entitlements`** — o grupo de acesso ao Keychain usado pelo provedor de credenciais (necessário
para o refresh de token em background):

```xml
<key>keychain-access-groups</key>
<array>
  <string>$(AppIdentifierPrefix)com.yourapp</string>
</array>
```

Confirme também que `Database.configure({ background: { minimumInterval, ... } })` foi de fato
passado — omitir `background` deixa o job desabilitado por completo, novamente de forma silenciosa.
`minimumInterval` no iOS é apenas uma dica de `earliestBeginDate`; o `BGTaskScheduler` (não esta
biblioteca) decide o horário real de wake, então um atraso ocasional de várias horas no
simulador/dispositivo é um comportamento esperado, não um bug.

## Qual o número máximo de linhas que posso inserir/selecionar de uma vez?

**Insert:** `Database.insert(schema).values(rows).execute()` lança um erro se `rows.length`
exceder `MAX_BATCH_INSERT_ROWS` (500) — verificado em `InsertQueryBuilder.execute()` antes de
qualquer SQL rodar:

```
InsertQueryBuilder: 501 rows exceeds MAX_BATCH_INSERT_ROWS (500). Split into smaller
batches, wrapped in Database.transaction() if they must be atomic.
```

Divida lotes maiores em pedaços de ≤500, envolvendo-os em `Database.transaction()` se precisarem
ser commitados atomicamente como um grupo.

**Select:** `.limit(n)` em um select builder usa `MAX_SYNC_PAGE_SIZE` (500) como padrão quando
omitido, e `execute()` lança um erro se `n` o exceder:

```
execute() limit (600) exceeds MAX_SYNC_PAGE_SIZE (500).
```

Para mais de 500 linhas, pagine os resultados com `.limit()`/`.offset()`, ou use
[`useInfiniteQuery`](./api-reference/hooks.md#useinfinitequery), que gerencia a paginação para
você.

## Posso usar `DROP`/`RENAME` em migrações?

Não. `Database.register()` só executa `ADD COLUMN` quando a `version` de um schema aumenta — não
há arquivo de migração para escrever e nenhuma forma de remover ou renomear uma coluna ou tabela
através desta biblioteca. Renomear uma coluna significa adicionar uma nova coluna e migrar os
dados você mesmo (por exemplo, no código da aplicação, ou em uma passagem pontual de SQL bruto via
`Database.execute()`); a coluna antiga permanece na tabela até que você a trate explicitamente.
Veja [Schemas](./guides/schemas.md) para como `version` e `columns` guiam as migrações.
