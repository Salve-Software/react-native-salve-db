---
title: Query Builder
---

`Database` expõe um query builder estático, no estilo Drizzle, sobre cada schema registrado. O JS
monta uma string SQL parametrizada; o core nativo a executa e retorna linhas simples. Todo método
do builder listado abaixo é totalmente tipado a partir do schema via `InferSelectModel`/
`InferInsertModel` — veja [Schemas](../guides/schemas.md).

Toda execução de query (`select`/`insert`/`update`/`delete`/`count`/`transaction`) é **síncrona**
— roda diretamente na thread JS, não como uma `Promise`. É por isso que as proteções abaixo
(`.limit()` obrigatório, a regra de coluna indexada) existem: uma chamada síncrona na thread JS
precisa ter um custo limitado e previsível.

## API estática do `Database`

```ts
Database.select<TSchema>(schema: TSchema): ISelectQueryBuilder<TSchema>;
Database.insert<TSchema>(schema: TSchema): IInsertQueryBuilder<TSchema>;
Database.update<TSchema>(schema: TSchema): IUpdateQueryBuilder<TSchema>;
Database.delete<TSchema>(schema: TSchema): IDeleteQueryBuilder<TSchema>;
Database.count<TSchema>(schema: TSchema): ICountQueryBuilder<TSchema>;
Database.transaction<T>(fn: (tx: IQueryClient) => T): T;
Database.execute(sql: string, params?: unknown[]): unknown[];
```

- **`select`/`insert`/`update`/`delete`/`count`** cada um retorna um builder encadeável restrito à
  tabela do `schema`. Nada é executado até que `.execute()` seja chamado.
- **`transaction`** roda `fn` dentro de um `BEGIN`/`COMMIT` nativo, revertendo em caso de qualquer
  erro lançado. `fn` recebe um `tx: IQueryClient` que expõe a mesma superfície
  `select`/`insert`/`update`/`delete`/`count`/`transaction`/`execute` — use `tx`, não `Database`,
  para toda chamada dentro do callback. Toda escrita dentro de `tx` ainda dispara seu trigger de
  tabela normalmente (então leituras dentro da mesma transação veem escritas não commitadas); a
  fila de sincronização só é populada uma vez, no `COMMIT`, não a cada escrita isolada.
- **`execute`** é a válvula de escape de SQL bruto, coberta [abaixo](#válvula-de-escape-de-sql-bruto).

```ts
db.transaction((tx) => {
  tx.insert(OrderSchema).values({ id, customerId, total }).execute();
  tx.insert(OrderItemSchema).values({ orderId: id, sku, qty }).execute();
});
```

## Select

```ts
interface ISelectQueryBuilder<TSchema> {
  where(condition: Condition): this;
  orderBy(column: keyof InferSelectModel<TSchema>, direction?: "asc" | "desc"): this;
  limit(n: number): this;
  offset(n: number): this;
  execute(): InferSelectModel<TSchema>[];
}
```

```ts
const activeUsers = Database
  .select(UserSchema)
  .where(eq('active', true))
  .orderBy('updatedAt', 'desc')
  .limit(50)
  .execute();
```

Todo `select` (e `count`) exclui automaticamente linhas com soft delete — o builder adiciona um AND
com `"deletedAt" IS NULL` à cláusula `WHERE`; veja
[Schemas](../guides/schemas.md#a-coluna-injetada-deletedat-e-soft-deletes).

### O limite obrigatório de `.limit()`

Não é necessário chamar `.limit()` explicitamente, mas `execute()` sempre aplica um:

- Se `.limit()` nunca foi chamado, `execute()` usa por padrão `MAX_SYNC_PAGE_SIZE` (`500`).
- Se `.limit()` foi chamado, seu valor deve ser um inteiro não negativo e **não pode exceder
  `MAX_SYNC_PAGE_SIZE` (500)** — um valor maior lança um erro no momento do `execute()`.

Esse mecanismo único cobre tanto "buscar uma linha pela chave primária" (`.limit(1)`) quanto
"buscar uma página de N linhas" com a mesma proteção: como `execute()` roda de forma síncrona na
thread JS, um conjunto de resultados sem limite bloquearia a thread por um tempo imprevisível.
`LIMIT` intencionalmente não se aplica a `update`/`delete` — SQLite não tem `LIMIT` nativo nessas
instruções, e "atualizar/apagar tudo que corresponde à condição" é o comportamento esperado, não
algo a paginar.

Não confunda isso com `MAX_BATCH_INSERT_ROWS` (também `500`) — essa constante limita, em vez disso,
a contagem de linhas de `InsertQueryBuilder.values()`, uma proteção separada coberta em
[Insert](#insert).

## A regra de coluna indexada

Toda coluna passada para `.where()` ou `.orderBy()` — em `select`, `count`, `update` ou `delete` —
deve ser a `primaryKey` do schema ou a **coluna líder** de algum índice declarado em
`schema.indexes`. Isso é imposto por `assertIndexedColumns`, que roda antes de todo `execute()`
síncrono:

```ts
const isIndexed = schema.indexes?.some((index) => index.columns[0] === column);
if (!isIndexed && column !== schema.primaryKey) {
  throw new Error(
    `Synchronous execute() requires an index covering column "${column}" as its leading column ` +
    `(schema "${schema.name}"). Declare it in schema.indexes, or remove it from where()/orderBy().`,
  );
}
```

`.limit()` sozinho limita o *tamanho do resultado*, não o *custo da varredura* — uma condição ou
ordenação em uma coluna sem índice líder ainda força o SQLite a varrer a tabela inteira antes de
`LIMIT` ser aplicado (ou, no caso de `update`/`delete`, antes de conseguir encontrar as linhas a
alterar). A regra reutiliza o matching `leftmost-prefix` contra `IIndexDefinition.columns`: uma
coluna só conta como indexada se for a *primeira* entrada do array `columns` de algum índice —
declará-la em segundo ou terceiro lugar em um índice composto não satisfaz a regra, o que reflete
como o SQLite de fato usa índices compostos para `WHERE`/`ORDER BY`.

`InsertQueryBuilder` e a válvula de escape `Database.execute(sql, params)` bruta não têm proteção
de índice — o custo do insert já é proporcional ao que quem chama escreveu explicitamente, e SQL
bruto não tem um schema associado contra o qual validar um índice.

## Insert

```ts
interface IInsertQueryBuilder<TSchema> {
  values(row: InferInsertModel<TSchema> | InferInsertModel<TSchema>[]): this;
  onConflictDoUpdate(): this;
  execute(): void;
}
```

```ts
// linha única
Database.insert(UserSchema).values({ id, name, email, updatedAt: Date.now() }).execute();

// insert em lote (um único INSERT multi-linha)
Database.insert(UserSchema).values(users).execute();

// upsert — ex.: aplicando uma página trazida pela sincronização
Database.insert(UserSchema).values(user).onConflictDoUpdate().execute();
```

- **`values`** aceita uma linha ou um array de linhas (todas com o mesmo conjunto de colunas) e as
  compila em um único `INSERT` multi-linha.
- **`onConflictDoUpdate`** transforma o insert em um upsert: em caso de conflito de chave primária,
  toda outra coluna inserida é sobrescrita com o valor recebido (`excluded.col`). Requer que
  `values()` tenha sido chamado antes.

Duas proteções de tamanho se aplicam a um lote, ambas verificadas no momento do `execute()`:

- **`MAX_BATCH_INSERT_ROWS = 500`** — a quantidade de linhas passada para `values()` não pode
  exceder esse valor, ou `execute()` lança `InsertQueryBuilder: N rows exceeds
  MAX_BATCH_INSERT_ROWS (500)`. Divida lotes maiores em múltiplas chamadas, envolvidas em
  `Database.transaction()` se precisarem ser atômicas.
- **`SQLITE_MAX_BOUND_PARAMS = 999`** — uma segunda verificação, independente, rejeita o lote se
  `linhas × colunas` exceder esse valor — o próprio limite do SQLite para parâmetros vinculados por
  instrução em builds padrão. Uma tabela larga pode atingir esse limite bem antes de atingir o
  limite de 500 linhas (ex.: 500 linhas × 3 colunas = 1500 parâmetros já excede 999).

## Update

```ts
interface IUpdateQueryBuilder<TSchema> {
  set(patch: Partial<InferInsertModel<TSchema>>): this;
  where(condition: Condition): this;
  execute(): void;
}
```

```ts
Database.update(UserSchema)
  .set({ name: 'New Name', updatedAt: Date.now() })
  .where(eq('id', userId))
  .execute();
```

`where()` é opcional mas, quando presente, está sujeito à mesma
[regra de coluna indexada](#a-regra-de-coluna-indexada) que `select`.

## Delete

```ts
interface IDeleteQueryBuilder<TSchema> {
  where(condition: Condition): this;
  execute(): void;
}
```

```ts
Database.delete(UserSchema).where(eq('id', userId)).execute();
```

`delete` nunca emite um `DELETE` SQL — ele faz soft delete executando
`UPDATE <table> SET deletedAt = ? [WHERE ...]`. Um `Database.delete(UserSchema).execute()` simples
(sem `.where()`) faz soft delete de todas as linhas da tabela. `where()`, quando presente, está
sujeito à [regra de coluna indexada](#a-regra-de-coluna-indexada).

## Count

```ts
interface ICountQueryBuilder<TSchema> {
  where(condition: Condition): this;
  execute(): number;
}
```

```ts
const pendingCount = Database.count(OrderSchema).where(eq('status', 'pending')).execute();
```

Assim como `select`, `count` exclui automaticamente linhas com soft delete. `where()`, quando
presente, está sujeito à [regra de coluna indexada](#a-regra-de-coluna-indexada).

## Operadores de condição

Todos os operadores vivem na exportação de nível superior do pacote e constroem um valor
`Condition` opaco consumido por `where()`. Colunas são chaves string simples do schema.

| Operador | Assinatura | Exemplo |
|---|---|---|
| `eq` | `eq(column: string, value: SqlValue): Condition` | `eq('id', userId)` |
| `ne` | `ne(column: string, value: SqlValue): Condition` | `ne('status', 'archived')` |
| `gt` | `gt(column: string, value: SqlValue): Condition` | `gt('age', 18)` |
| `gte` | `gte(column: string, value: SqlValue): Condition` | `gte('updatedAt', since)` |
| `lt` | `lt(column: string, value: SqlValue): Condition` | `lt('retryCount', 3)` |
| `lte` | `lte(column: string, value: SqlValue): Condition` | `lte('price', 100)` |
| `like` | `like(column: string, pattern: string): Condition` | `like('name', '%acme%')` |
| `inArray` | `inArray(column: string, values: SqlValue[]): Condition` | `inArray('id', [1, 2, 3])` |
| `isNull` | `isNull(column: string): Condition` | `isNull('archivedAt')` |
| `isNotNull` | `isNotNull(column: string): Condition` | `isNotNull('email')` |
| `and` | `and(...conditions: Condition[]): Condition` | `and(eq('active', true), gt('age', 18))` |
| `or` | `or(...conditions: Condition[]): Condition` | `or(eq('status', 'new'), eq('status', 'pending'))` |
| `not` | `not(condition: Condition): Condition` | `not(eq('status', 'archived'))` |

```ts
Database.select(OrderSchema)
  .where(and(eq('customerId', customerId), or(eq('status', 'pending'), eq('status', 'processing'))))
  .orderBy('createdAt', 'desc')
  .limit(20)
  .execute();
```

## Válvula de escape de SQL bruto

```ts
Database.execute(sql: string, params?: unknown[]): unknown[];
```

Executa SQL bruto e parametrizado na mesma conexão e retorna as linhas resultantes como objetos
simples. Não tem inferência de tipos nem proteção de coluna indexada (não há schema contra o qual
validar), mas escritas feitas dessa forma ainda são rastreadas normalmente — o trigger de
sincronização é definido no nível da tabela SQLite, não dentro do query builder, então um
`INSERT`/`UPDATE`/`DELETE` bruto ainda popula a `sync_queue` como uma escrita feita pelo builder.

```ts
const rows = Database.execute(
  'SELECT id, name FROM users WHERE deletedAt IS NULL AND email LIKE ?',
  ['%@example.com'],
);
```

Dentro de um callback de `Database.transaction(fn)`, use `tx.execute(...)` em vez disso — mesma
assinatura, restrita à transação.
