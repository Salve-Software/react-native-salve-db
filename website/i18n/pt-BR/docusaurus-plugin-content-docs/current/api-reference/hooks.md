---
title: Hooks
---

Referência dos três hooks React exportados por `@salve-software/react-native-salve-db`. Para a
explicação narrativa — por que eles existem, como a re-renderização ao vivo funciona, e como o
sync interage com eles — veja [Hooks](../guides/hooks.md). Esta página é focada em assinaturas.

```ts
import { useQuery, useInfiniteQuery, useDatabaseReady } from '@salve-software/react-native-salve-db';
```

## `useQuery`

```ts
function useQuery<TSchema extends AnySchema>(
  props: IUseQueryProps<TSchema>
): IUseQueryResult<InferSelectModel<TSchema>>;

interface IUseQueryProps<TSchema> {
  schema: TSchema;
  queryFn: (q: SelectQueryBuilder<TSchema>) => SelectQueryBuilder<TSchema>;
  deps?: readonly JsonValue[];
}

interface IUseQueryResult<TRow> {
  data: TRow[] | null;
  error: unknown;
  isLoading: boolean;
}
```

Executa um `select` contra `schema`, com cache e mantido ao vivo: ele re-executa e re-renderiza
automaticamente sempre que uma escrita toca a tabela de `schema`, não importa a origem (este hook,
outra tela, SQL bruto, ou sync em background nativo). Requer [`useDatabaseReady`](#usedatabaseready)
internamente — `data` permanece `null` e `isLoading` permanece `true` até que o banco de dados
tenha terminado `configure`/`register`. Se `schema.sync?.enabled` for `true`, a montagem também
solicita um sync de leitura para aquele schema.

`deps` é comparado com uma stringificação estrutural estável — passe quaisquer valores
primitivos/array/objeto dos quais seu closure `queryFn` depende (por exemplo, um valor de filtro),
da mesma forma que você faria com um array de deps de `useEffect`.

```ts
const { data, isLoading, error } = useQuery({
  schema: UserSchema,
  queryFn: (q) => q.where(eq('active', true)).orderBy('createdAt', 'desc'),
  deps: [],
});
```

## `useInfiniteQuery`

```ts
function useInfiniteQuery<TSchema extends AnySchema>(
  props: IUseInfiniteQueryProps<TSchema>
): IUseInfiniteQueryResult<Row<TSchema>>;

interface IUseInfiniteQueryProps<TSchema> {
  schema: TSchema;
  /** Aplique where()/orderBy() aqui — não chame limit()/offset(), o hook gerencia a paginação. */
  queryFn: (q: SelectQueryBuilder<TSchema>) => SelectQueryBuilder<TSchema>;
  /** Linhas buscadas por página, repassadas para .limit() (sujeito a MAX_SYNC_PAGE_SIZE). */
  pageSize: number;
  deps?: readonly JsonValue[];
}

interface IUseInfiniteQueryResult<TRow> {
  /** Todas as páginas carregadas, achatadas em um único array, na ordem de busca. */
  data: TRow[] | null;
  error: unknown;
  /** True até que a primeira página tenha carregado. */
  isLoading: boolean;
  hasNextPage: boolean;
  /** No-op se hasNextPage for false. */
  fetchNextPage: () => void;
}
```

Variante paginada de `useQuery`: carrega `pageSize` linhas por vez via `fetchNextPage()`,
acumulando páginas em `data`. `pageSize` deve ser um inteiro positivo, senão o hook lança um erro.
Mantido ao vivo da mesma forma que `useQuery` — qualquer escrita na tabela de `schema` (de
qualquer origem) reinicia para a página 0 e refaz a busca, de forma que o estado de paginação
nunca diverge do que está em disco. Não é indicado para feeds que preservam o scroll com
"inserir no topo" — uma escrita sempre reinicia a partir da página 0.

```ts
const { data, hasNextPage, fetchNextPage, isLoading } = useInfiniteQuery({
  schema: UserSchema,
  queryFn: (q) => q.orderBy('createdAt', 'desc'),
  pageSize: 20,
});
```

## `useDatabaseReady`

```ts
function useDatabaseReady(): IDatabaseReadyState;

interface IDatabaseReadyState {
  isReady: boolean;
  isLoading: boolean;
  error: unknown;
}
```

Lê o estado de prontidão do banco de dados definido pelo `SalveDbProvider` ancestral mais próximo.
Usado para bloquear telas/queries até que `configure`/`register` tenham terminado, e para expor
uma falha no momento da inicialização sem quebrar o app. `useQuery` e `useInfiniteQuery` já chamam
isso internamente — use-o diretamente apenas para bloqueio a nível de tela, fora desses hooks.

```ts
const { isReady, isLoading, error } = useDatabaseReady();
if (!isReady) return <SplashScreen loading={isLoading} error={error} />;
```
