---
title: Usuário Atual
---

O Salve DB não tem embutido nenhum conceito de "usuário logado" nos schemas
ou no query builder — `userId` (ou qualquer nome que você escolher) é uma
coluna comum do seu próprio schema. O que a biblioteca fornece é uma pequena
conveniência em memória, `currentUser()`, para que você não precise passar o
id do usuário atual manualmente por todo ponto de chamada de query.

## Definindo e lendo o usuário atual

```ts
import { Database } from '@salve-software/react-native-salve-db';

// uma vez no login, e novamente em todo cold start assim que a sessão do
// seu próprio app tiver sido reidratada
Database.setCurrentUser(session.userId);

Database.getCurrentUser(); // 'abc123' | null — nunca lança exceção

Database.logout(); // limpa os tokens de credencial armazenados *e* o usuário atual
Database.reset();  // apaga dados/schemas/config locais *e* o usuário atual
```

- `Database.setCurrentUser(id: string)` — registra o id usado por
  `currentUser()`. Lança uma exceção se `id` estiver vazio/em branco.
- `Database.getCurrentUser()` — leitura que não lança exceção; retorna `null`
  se não estiver definido.
- `Database.logout()` — limpa os tokens OAuth2 armazenados para um logout
  normal; dados locais, schemas e config permanecem intactos. Também limpa o
  usuário atual.
- `Database.reset()` — desmontagem completa (dados locais, schemas, config).
  Também limpa o usuário atual.

## `currentUser()`

```ts
import { currentUser } from '@salve-software/react-native-salve-db';

function currentUser(): string;
```

Resolve para o id definido por `Database.setCurrentUser()`, para uso como
valor dentro de `.where()`/`.values()`:

```ts
import { Database, currentUser, eq } from '@salve-software/react-native-salve-db';
import { TaskSchema } from './schemas/TaskSchema';

Database.select(TaskSchema).where(eq('userId', currentUser())).limit(50).execute();
Database.insert(TaskSchema).values({ userId: currentUser(), title: 'Buy milk' }).execute();
```

Três coisas para ter em mente:

- **É uma conveniência de valor, não uma fronteira de segurança nem um filtro
  automático em nível de linha.** `currentUser()` apenas resolve um id — não
  garante que qualquer query filtre por ele. Uma query que omite
  `eq('userId', currentUser())` ainda lê ou escreve através das linhas de
  todos os usuários; adicionar o filtro em toda query que precisar dele é
  responsabilidade sua.
- **Lança exceção se não definido.** Chamar `currentUser()` antes que
  `Database.setCurrentUser()` tenha sido executado alguma vez lança
  `currentUser(): no user set — call Database.setCurrentUser() first`,
  falhando de forma proposital e explícita em vez de resolver silenciosamente
  para `null` (o que compilaria para `WHERE userId = NULL`, retornando zero
  linhas sem nenhuma pista do motivo). Use `Database.getCurrentUser()` quando
  precisar de uma verificação que não lance exceção.
- **É apenas em memória.** Ao contrário dos tokens de credencial (armazenados
  no Keychain/Keystore pelo credential provider nativo), o id do usuário
  atual não é persistido por esta biblioteca. Ele não sobrevive a um reinício
  do app — chame `Database.setCurrentUser()` novamente em todo cold start,
  assim que o estado de sessão/autenticação do seu próprio app tiver sido
  reidratado.

Veja o guia [Query Builder](../guides/query-builder.md) para `eq` e os
demais operadores de condição, e [Hooks](../guides/hooks.md) para combinar
`currentUser()` com o `deps` de `useQuery`/`useInfiniteQuery`.
