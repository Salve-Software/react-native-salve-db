---
title: Hooks
---

Três hooks cobrem a superfície reativa em primeiro plano: `useQuery` para um
único conjunto de resultados ao vivo, `useInfiniteQuery` para leituras
paginadas, e `useDatabaseReady` para condicionar a renderização ao estado de
boot do `SalveDbProvider`. Todos os três são baseados em cache e re-executam
automaticamente a qualquer escrita na tabela envolvida — independentemente de
a escrita ter vindo deste hook, de outra tela, de SQL bruto, de uma migração,
ou do motor de sincronização nativo.

## `useQuery`

```ts
function useQuery<TSchema extends AnySchema>(props: {
  schema: TSchema;
  queryFn: (q: SelectQueryBuilder<TSchema>) => SelectQueryBuilder<TSchema>;
  deps?: readonly JsonValue[];
}): {
  data: InferSelectModel<TSchema>[] | null;
  isLoading: boolean;
  error: unknown;
};
```

- `schema` — o schema a partir do qual ler e ao qual se inscrever. Qualquer
  `INSERT`/`UPDATE`/`DELETE` contra essa tabela re-executa `queryFn` e
  re-renderiza.
- `queryFn` — recebe um query builder de `select` já vinculado a `schema`;
  aplique `where`/`orderBy`/`limit`/`offset` aqui. Veja o guia
  [Query Builder](../guides/query-builder.md).
- `deps` — entradas reativas extras (serializáveis em JSON) além de `schema`,
  por exemplo um termo de busca. Alterar `deps` re-executa a query da mesma
  forma que uma escrita na tabela.

`data` é `null` até que o primeiro resultado chegue; `isLoading` é `true`
enquanto o `SalveDbProvider` ainda está inicializando (`useDatabaseReady`) ou
enquanto esta query específica ainda não produziu um resultado; `error`
expõe tanto um erro de boot do provider quanto um erro de execução da query.

Se `schema.sync.enabled` for `true`, montar o hook também dispara uma
**sincronização com throttle, acionada por leitura**: ler uma tabela
sincronizada aciona `Database.sync(schema.name)` em segundo plano, em vez de
exigir que você mesmo o chame. Veja [Sync](./sync.md) para o contrato
subjacente de push/pull.

```tsx
import { useQuery } from '@salve-software/react-native-salve-db';
import { eq } from '@salve-software/react-native-salve-db';
import { UserSchema } from './schemas/UserSchema';

function UserList({ search }: { search: string }) {
  const { data, isLoading, error } = useQuery({
    schema: UserSchema,
    queryFn: (q) => q.where(eq('name', search)).orderBy('updatedAt', 'desc').limit(50),
    deps: [search],
  });

  if (isLoading) return <LoadingSpinner />;
  if (error) return <ErrorBanner error={error} />;

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(user) => String(user.id)}
      renderItem={({ item }) => <UserRow user={item} />}
    />
  );
}
```

Como `data` reflete toda escrita em `users` vinda de qualquer origem, editar
uma linha a partir do [Studio](../studio.md), aplicar um pull de
sincronização, ou escrever a partir de outra tela — tudo re-renderiza essa
lista sem qualquer invalidação manual.

## `useInfiniteQuery`

```ts
function useInfiniteQuery<TSchema extends AnySchema>(props: {
  schema: TSchema;
  queryFn: (q: SelectQueryBuilder<TSchema>) => SelectQueryBuilder<TSchema>;
  pageSize: number;
  deps?: readonly JsonValue[];
}): {
  data: Row<TSchema>[] | null;
  isLoading: boolean;
  error: unknown;
  hasNextPage: boolean;
  fetchNextPage: () => void;
};
```

Mesma semântica de tabela ao vivo do `useQuery`, mais paginação:

- `queryFn` define apenas `where`/`orderBy` — não chame `.limit()`/`.offset()`
  você mesmo, o hook gerencia a paginação e repassa `pageSize` internamente.
- `fetchNextPage()` carrega a próxima página e a acrescenta a `data` (é um
  no-op quando `hasNextPage` já é `false`).
- `data` é o conjunto de todas as páginas carregadas achatado em um único
  array, na ordem em que foram buscadas.

**Qualquer escrita na tabela de `schema` reinicia a paginação de volta para a
página 0** e busca novamente desde o início — este hook não é um feed que
preserva o scroll ao "inserir no topo". Um pull de sincronização em segundo
plano chegando no meio do scroll, ou outra tela inserindo uma linha, colapsa
as páginas acumuladas e recomeça, trocando a posição do scroll por
consistência garantida em disco.

```tsx
import { useInfiniteQuery } from '@salve-software/react-native-salve-db';
import { TaskSchema } from './schemas/TaskSchema';

function TaskFeed() {
  const { data, isLoading, hasNextPage, fetchNextPage } = useInfiniteQuery({
    schema: TaskSchema,
    queryFn: (q) => q.orderBy('createdAt', 'desc'),
    pageSize: 20,
  });

  return (
    <FlatList
      data={data ?? []}
      keyExtractor={(task) => String(task.id)}
      renderItem={({ item }) => <TaskRow task={item} />}
      onEndReached={() => hasNextPage && fetchNextPage()}
      refreshing={isLoading}
    />
  );
}
```

## `useDatabaseReady`

```ts
function useDatabaseReady(): {
  isReady: boolean;
  isLoading: boolean;
  error: unknown;
};
```

Lê o estado de prontidão definido pelo `SalveDbProvider` ancestral mais
próximo. O `SalveDbProvider` executa `Database.configure(config)` e depois
`Database.register(schema)` para cada schema em `schemas` na montagem, e
define:

- `{ isReady: false, isLoading: true, error: null }` enquanto configure/register
  estão em execução,
- `{ isReady: true, isLoading: false, error: null }` assim que todo schema
  tiver sido registrado com sucesso,
- `{ isReady: false, isLoading: false, error }` se configure ou qualquer
  chamada de register lançar uma exceção.

`useQuery` e `useInfiniteQuery` já chamam isso internamente e incorporam seu
estado em seus próprios `isLoading`/`error` — você só precisa de
`useDatabaseReady` diretamente ao condicionar algo fora de uma query, como o
próprio shell do app.

```tsx
import { useDatabaseReady } from '@salve-software/react-native-salve-db';

function AppShell({ children }: { children: React.ReactNode }) {
  const { isReady, isLoading, error } = useDatabaseReady();

  if (error) return <BootErrorScreen error={error} />;
  if (isLoading || !isReady) return <SplashScreen />;

  return <>{children}</>;
}
```
