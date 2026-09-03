---
title: Database
---

Fachada somente estática sobre o núcleo nativo SQLite (`src/database/Database.class.ts`). Todo
método delega para a mesma conexão nativa subjacente — não há instância para construir, e não há
`new Database()`.

```ts
import { Database } from '@salve-software/react-native-salve-db';
```

## Configuração

### `Database.configure(props: IConfigureProps): void`

Abre (ou cria) o arquivo de banco de dados local e define as configurações de sync/auth. Deve ser
chamado uma vez, antes de `register`, `select`/`insert`/`update`/`delete`, ou `execute`.

```ts
interface IConfigureProps {
  name: string;
  baseUrl?: string;
  network?: { timeout: number };
  credentials?: ICredentialsDefinition; // Apenas OAuth2 no MVP
  walMode?: boolean;       // padrão true
  syncOnAppOpen?: boolean; // padrão true
  background?: {
    minimumInterval: number;
    requiresNetwork?: boolean;
    requiresCharging?: boolean;
  };
}
```

```ts
Database.configure({
  name: 'my-app.db',
  baseUrl: 'https://api.example.com',
  credentials: {
    provider: 'oauth2',
    tokens: { accessToken, refreshToken },
    refresh: {
      endpoint: '/auth/refresh',
      response: { accessToken: '$.access_token', refreshToken: '$.refresh_token' },
    },
  },
  background: { minimumInterval: 15 * 60 * 1000, requiresNetwork: true },
});
```

### `Database.register(props: IRegisterProps): Promise<void>`

Registra um schema: cria sua tabela na primeira execução, ou aplica migrações `ADD COLUMN`
pendentes se `schema.version` aumentou desde a última execução. Requer que `configure` já tenha
sido executado. Lança erro se `schema.name`, `schema.version`, ou `schema.primaryKey` estiver
ausente, ou se `primaryKey` não for uma chave em `schema.columns`.

```ts
interface IRegisterProps {
  schema: AnySchema;
}
```

```ts
await Database.register({ schema: UserSchema });
```

### `Database.reset(): Promise<void>`

Apaga todos os dados locais e credenciais — um logout completo. Limpa o usuário atual em memória
(veja `setCurrentUser` abaixo) antes da limpeza nativa, independentemente de ela ter sucesso ou
não. Após isso, `register()` de cada schema retoma o uso local; `configure()` novamente só é
necessário para restaurar o sync.

```ts
await Database.reset();
```

### `Database.logout(): void`

Limpa apenas os tokens de credenciais armazenados; dados locais, schemas e configuração
permanecem intactos. Use para um logout normal. Limpa o usuário atual antes da chamada nativa,
independentemente de ela ter sucesso ou não.

```ts
Database.logout();
```

### `Database.setCurrentUser(id: string): void`

Registra o id do usuário atualmente logado, resolvido pelo helper `currentUser()` a nível de
pacote (veja [Operadores & Tipos](./operators-types.md)) dentro de `.where()`/`.values()`. Chame
novamente a cada cold start, assim que a própria sessão do app for reidratada — esse estado é
apenas em memória, não é persistido por esta biblioteca. Lança erro se `id` estiver vazio ou em
branco.

```ts
Database.setCurrentUser('user-123');
```

### `Database.getCurrentUser(): string | null`

Leitura sem lançamento de erro do id do usuário atual, ou `null` se nenhum estiver definido.

```ts
const userId = Database.getCurrentUser();
```

## Consultas (Queries)

Todo método de query retorna um builder escopado ao `schema`; nada é executado até que você chame
`.execute()`. Veja [Query Builder](../guides/query-builder.md) para a explicação completa e
[Operadores & Tipos](./operators-types.md) para os operadores de condição de `where()` e os tipos
de linha inferidos.

### `Database.select<TSchema>(schema: TSchema): ISelectQueryBuilder<TSchema>`

Inicia um `SELECT` na tabela de `schema`.

```ts
interface ISelectQueryBuilder<TSchema> {
  where(condition: Condition): this;
  orderBy(column: keyof InferSelectModel<TSchema>, direction?: 'asc' | 'desc'): this;
  limit(n: number): this;
  offset(n: number): this;
  execute(): InferSelectModel<TSchema>[];
}
```

`execute()` usa `MAX_SYNC_PAGE_SIZE` (500) como padrão de `limit` quando omitido, e lança erro se
`limit` o excede. Toda coluna referenciada em `where()`/`orderBy()` precisa ser a coluna líder de
um índice declarado (ou a chave primária) — veja o
[FAQ](../faq-troubleshooting.md#por-que-minha-query-lança-um-erro-sobre-índice-ausente).

```ts
const rows = Database.select(UserSchema)
  .where(eq('id', currentUser()))
  .orderBy('createdAt', 'desc')
  .limit(20)
  .execute();
```

### `Database.insert<TSchema>(schema: TSchema): IInsertQueryBuilder<TSchema>`

Inicia um `INSERT` na tabela de `schema`.

```ts
interface IInsertQueryBuilder<TSchema> {
  values(row: InferInsertModel<TSchema> | InferInsertModel<TSchema>[]): this;
  /** Upsert: em conflito de chave primária, sobrescreve toda outra coluna inserida com `excluded.col`. */
  onConflictDoUpdate(): this;
  execute(): void;
}
```

Um lote maior que `MAX_BATCH_INSERT_ROWS` (500 linhas) lança erro — veja o
[FAQ](../faq-troubleshooting.md#qual-o-número-máximo-de-linhas-que-posso-inserirselecionar-de-uma-vez).

```ts
Database.insert(UserSchema)
  .values({ id: '1', name: 'Ada', createdAt: Date.now() })
  .execute();

Database.insert(UserSchema)
  .values(rows)
  .onConflictDoUpdate()
  .execute();
```

### `Database.update<TSchema>(schema: TSchema): IUpdateQueryBuilder<TSchema>`

Inicia um `UPDATE` na tabela de `schema`.

```ts
interface IUpdateQueryBuilder<TSchema> {
  set(patch: Partial<InferInsertModel<TSchema>>): this;
  where(condition: Condition): this;
  execute(): void;
}
```

```ts
Database.update(UserSchema)
  .set({ name: 'Ada Lovelace' })
  .where(eq('id', '1'))
  .execute();
```

### `Database.delete<TSchema>(schema: TSchema): IDeleteQueryBuilder<TSchema>`

Inicia um `DELETE` na tabela de `schema`.

```ts
interface IDeleteQueryBuilder<TSchema> {
  where(condition: Condition): this;
  execute(): void;
}
```

```ts
Database.delete(UserSchema).where(eq('id', '1')).execute();
```

### `Database.count<TSchema>(schema: TSchema): ICountQueryBuilder<TSchema>`

Inicia um `COUNT(*)` na tabela de `schema`.

```ts
interface ICountQueryBuilder<TSchema> {
  where(condition: Condition): this;
  execute(): number;
}
```

```ts
const total = Database.count(UserSchema).where(eq('active', true)).execute();
```

### `Database.transaction<T>(fn: (tx: IQueryClient) => T): T`

Executa `fn` dentro de uma transação nativa `BEGIN`/`COMMIT`, revertendo (rollback) se `fn` lançar
um erro. `tx` expõe a mesma superfície `select`/`insert`/`update`/`delete`/`count`/`execute`/
`transaction` que o próprio `Database`, escopada àquela transação.

```ts
interface IQueryClient {
  select<TSchema>(schema: TSchema): ISelectQueryBuilder<TSchema>;
  insert<TSchema>(schema: TSchema): IInsertQueryBuilder<TSchema>;
  update<TSchema>(schema: TSchema): IUpdateQueryBuilder<TSchema>;
  delete<TSchema>(schema: TSchema): IDeleteQueryBuilder<TSchema>;
  count<TSchema>(schema: TSchema): ICountQueryBuilder<TSchema>;
  transaction<T>(fn: (tx: IQueryClient) => T): T;
  execute(sql: string, params?: unknown[]): unknown[];
}
```

Toda escrita dentro de `tx` ainda dispara os triggers normalmente — a fila de sync é populada no
`COMMIT`, não em cada escrita isolada.

```ts
Database.transaction((tx) => {
  tx.insert(OrderSchema).values(order).execute();
  tx.update(UserSchema).set({ orderCount: count + 1 }).where(eq('id', userId)).execute();
});
```

### `Database.execute(sql: string, params?: unknown[]): unknown[]`

Válvula de escape: executa SQL parametrizado bruto e retorna as linhas resultantes como objetos
simples. Sem segurança de tipos ou inferência, mas como os triggers são definidos no nível de
tabela do SQLite, o SQL bruto ainda é rastreado normalmente pela `sync_queue`.

```ts
const rows = Database.execute('SELECT * FROM users WHERE id = ?', ['1']);
```

## Assinaturas de mudanças (Change subscriptions)

### `Database.subscribeToChanges(callback: (tables: string[]) => void): number`

Assina notificações de escrita a nível de tabela (insert/update/delete — de qualquer origem: query
builder, SQL bruto, migrações, ou sync em background). Retorna um id de assinatura, passe-o para
`unsubscribeFromChanges` para parar de escutar. `useQuery`/`useInfiniteQuery` usam isso
internamente — veja [Hooks](./hooks.md) — prefira os hooks a menos que você precise de uma
assinatura manual, fora do React.

```ts
const subId = Database.subscribeToChanges((tables) => {
  if (tables.includes('users')) refreshUserList();
});
```

### `Database.unsubscribeFromChanges(id: number): void`

Para uma assinatura previamente criada por `subscribeToChanges`.

```ts
Database.unsubscribeFromChanges(subId);
```

## Sync

Veja [Sync](../guides/sync.md) para o contrato completo de push/pull e resolução de conflitos.

### `Database.sync(schemaName: string): Promise<NativeSyncResult>`

Dispara uma sessão de sync para um único schema.

```ts
await Database.sync('users');
```

### `Database.syncAll(): Promise<NativeSyncResult[]>`

Dispara uma sessão de sync para todo schema registrado com `sync.enabled`.

```ts
await Database.syncAll();
```
