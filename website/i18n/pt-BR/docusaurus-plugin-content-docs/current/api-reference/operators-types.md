---
title: Operadores & Tipos
---

Referência dos operadores de condição de `where()`/`values()`, dos helpers de sessão do usuário
atual, e dos principais tipos inferidos/declarativos. Para o passo a passo conceitual completo de
schemas, colunas, índices e contratos de sync, veja [Schemas](../guides/schemas.md) e
[Sync](../guides/sync.md).

```ts
import { eq, ne, gt, gte, lt, lte, like, inArray, isNull, isNotNull, and, or, not, currentUser } from '@salve-software/react-native-salve-db';
```

## Operadores de condição

Cada operador retorna uma `Condition` opaca, passada para `.where()` em um builder de
select/update/delete/count. Nomes de colunas são strings simples, não tipadas contra o schema.

```ts
const eq = (column: string, value: SqlValue): Condition;
const ne = (column: string, value: SqlValue): Condition;
const gt = (column: string, value: SqlValue): Condition;
const gte = (column: string, value: SqlValue): Condition;
const lt = (column: string, value: SqlValue): Condition;
const lte = (column: string, value: SqlValue): Condition;
const like = (column: string, pattern: string): Condition;
const inArray = (column: string, values: SqlValue[]): Condition;
const isNull = (column: string): Condition;
const isNotNull = (column: string): Condition;
const and = (...conditions: Condition[]): Condition;
const or = (...conditions: Condition[]): Condition;
const not = (condition: Condition): Condition;
```

```ts
Database.select(UserSchema)
  .where(and(eq('active', true), or(gt('score', 100), isNotNull('vipSince'))))
  .execute();

Database.select(UserSchema).where(like('name', 'Ada%')).execute();
Database.select(UserSchema).where(inArray('status', ['pending', 'active'])).execute();
Database.select(UserSchema).where(not(isNull('deletedAt'))).execute();
```

Toda coluna referenciada por `where()` (ou `orderBy()`) precisa ser a coluna líder de um índice
declarado, ou a chave primária — veja o
[FAQ](../faq-troubleshooting.md#por-que-minha-query-lança-um-erro-sobre-índice-ausente).

## Usuário atual

```ts
Database.setCurrentUser(id: string): void;  // veja a referência da API de Database
Database.getCurrentUser(): string | null;   // veja a referência da API de Database
function currentUser(): string;
```

`currentUser()` resolve para o id definido por `Database.setCurrentUser()`, para uso como um valor
dentro de `.where()`/`.values()` (por exemplo, `eq('userId', currentUser())`). É uma conveniência
de valor, não uma barreira de segurança: não garante que alguma query de fato filtre por ele. Ele
lança um erro se nenhum usuário foi definido — veja o
[FAQ](../faq-troubleshooting.md#por-que-minha-chamada-currentuser-lançou-um-erro) — deliberadamente, em vez de
resolver para `null` (o que compilaria silenciosamente para `WHERE col = NULL`, correspondendo a
zero linhas sem nunca revelar o motivo).

```ts
Database.setCurrentUser('user-123');
Database.insert(OrderSchema).values({ id: '1', userId: currentUser(), total: 42 }).execute();
```

## Tipos de linha inferidos

Ambos são derivados das `columns` de um schema — veja [Schemas](../guides/schemas.md) para como as
colunas são declaradas.

```ts
/** Linha retornada por select(); adiciona a coluna reservada `deletedAt: number | null`. */
type InferSelectModel<TSchema> = {
  [K in keyof TSchema['columns']]: ColumnTsType<TSchema['columns'][K]['type']>
    | (TSchema['columns'][K]['nullable'] extends true ? null : never);
} & { deletedAt: number | null };

/** Linha aceita por insert()/update(). Colunas nullable e colunas com `default` são opcionais. */
type InferInsertModel<TSchema> = {
  // obrigatórias: colunas que não são nullable nem possuem default
} & {
  // opcionais: colunas que são nullable ou possuem um `default`
};
```

```ts
type User = InferSelectModel<typeof UserSchema>;
type NewUser = InferInsertModel<typeof UserSchema>;
```

## Tipos declarativos de schema & sync

A documentação completa, campo a campo, está em [Schemas](../guides/schemas.md) e
[Sync](../guides/sync.md). Referência rápida:

- **`ISchemaDefinition<TEntity>`** — uma tabela local: `name`, `version` (guia as migrações
  `ADD COLUMN` em `register()`), `primaryKey`, `columns`, `indexes` opcional, `relations`, e
  `sync`.
- **`IColumnDefinition`** — uma coluna: `type` (`"text" | "integer" | "real" | "boolean" | "blob" |
  "datetime"`), `nullable`, `unique`, `default` opcionais.
- **`IIndexDefinition`** — `name`, `columns` (a ordem importa — a coluna líder é a que
  `where()`/`orderBy()` precisa corresponder), `unique` opcional.
- **`ISyncDefinition`** — o contrato de sync REST de um schema: `enabled`, `direction`
  (`"bidirectional"` apenas no MVP), `conflict` (`lastWriteWins` / `serverWins` / `clientWins`),
  `transport` (`"rest"` apenas), `endpoint`, `background` opcional, `pagination` opcional.

```ts
const UserSchema: ISchemaDefinition<User> = {
  name: 'users',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'text' },
    name: { type: 'text' },
    active: { type: 'boolean', default: true },
    createdAt: { type: 'datetime' },
  },
  indexes: [{ name: 'idx_users_active', columns: ['active'] }],
  sync: {
    enabled: true,
    direction: 'bidirectional',
    conflict: { strategy: 'lastWriteWins', field: 'updatedAt' },
    transport: 'rest',
    endpoint: { basePath: '/users', listQueryTemplate: 'updatedAfter={since}&limit={limit}', cursorField: 'updatedAt' },
  },
};
```
