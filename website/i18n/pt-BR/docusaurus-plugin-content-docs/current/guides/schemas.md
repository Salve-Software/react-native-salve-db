---
title: Schemas
---

Um schema é um objeto simples que descreve uma tabela SQLite local: seu nome, versão, chave
primária, colunas, índices, relações e (opcionalmente) seu contrato de sincronização. Schemas são
dados declarativos, não classes ou funções — tanto o query builder quanto os motores nativos de
migração/sincronização os leem diretamente.

## `ISchemaDefinition<TEntity>`

```ts
interface ISchemaDefinition<TEntity> {
  name: string;
  version: number;
  primaryKey: keyof TEntity;
  columns: Record<string, IColumnDefinition>;
  indexes?: IIndexDefinition[];
  relations?: IRelationDefinition<TEntity>[];
  sync?: ISyncDefinition;
}
```

- **`name`** — nome único da tabela, ex.: `"users"`.
- **`version`** — incrementado sempre que `columns` muda; direciona as auto-migrações (veja abaixo).
- **`primaryKey`** — deve ser uma chave de `TEntity`. Obrigatório em todo insert — o MVP não tem
  autoincrement nativo, então o app é responsável por gerar ids (ex.: um UUID gerado no cliente).
- **`columns`** — um mapa de nome de coluna para [`IColumnDefinition`](#icolumndefinition).
- **`indexes`** — lista opcional de [`IIndexDefinition`](#iindexdefinition). Obrigatório para
  qualquer coluna usada em `where()`/`orderBy()` além da chave primária — veja
  [Query Builder](../guides/query-builder.md#a-regra-de-coluna-indexada).
- **`relations`** — links opcionais de chave estrangeira para schemas pai, veja
  [`IRelationDefinition`](#irelationdefinition).
- **`sync`** — `ISyncDefinition` opcional. Omita completamente para tabelas somente locais.

## `IColumnDefinition`

```ts
interface IColumnDefinition {
  type: "text" | "integer" | "real" | "boolean" | "blob" | "datetime";
  nullable?: boolean;
  unique?: boolean;
  default?: unknown;
}
```

- **`type`** — o tipo de armazenamento do SQLite. `datetime` é armazenado e inferido como `number`
  (epoch millis) — não um `Date` e não uma string — para que não haja ambiguidade de fuso horário
  em nenhum ponto do projeto (parâmetros de query, payloads de sincronização, comparações de
  conflito usam a mesma convenção de epoch-millis).
- **`nullable`** — quando `true`, a coluna aceita `NULL` e se torna opcional no modelo de insert
  inferido.
- **`unique`** — adiciona uma constraint `UNIQUE` na coluna.
- **`default`** — um valor padrão. Uma coluna com `default` (e sem `nullable`) também é opcional no
  insert; uma coluna sem nenhum dos dois é obrigatória.

A inferência de tipos TS (`InferSelectModel`/`InferInsertModel`, de
[Query Builder](../guides/query-builder.md)) mapeia `type` para:

| `IColumnDefinition.type` | Tipo TS |
|---|---|
| `text` | `string` |
| `integer` | `number` |
| `real` | `number` |
| `boolean` | `boolean` (SQLite armazena `0`/`1`; a coerção acontece nativamente) |
| `blob` | `Uint8Array` |
| `datetime` | `number` (epoch millis) |

## `IIndexDefinition`

```ts
interface IIndexDefinition {
  name: string;
  columns: string[];
  unique?: boolean;
}
```

- **`name`** — nome único do índice, ex.: `"idx_users_email"`.
- **`columns`** — colunas cobertas pelo índice, **na ordem de declaração**. A ordem importa: a
  regra de coluna indexada do query builder só reconhece a *primeira* coluna do array como
  coberta — veja [Query Builder](../guides/query-builder.md#a-regra-de-coluna-indexada).
- **`unique`** — adiciona uma constraint `UNIQUE` ao índice.

## `IRelationDefinition`

```ts
interface IRelationDefinition<TEntity> {
  column: keyof TEntity;
  references: string;
}
```

Um link de chave estrangeira da `column` deste schema para um schema pai chamado `references`.
Declarado no schema filho; não existe declaração reversa/`hasMany`.

## A coluna injetada `deletedAt` e soft deletes

Toda schema recebe uma coluna `deletedAt: { type: 'datetime', nullable: true }` injetada
automaticamente quando é registrada — **não declare você mesmo uma coluna literalmente chamada
`deletedAt`**; fazer isso lança um erro no momento do registro (`"'deletedAt' is a reserved column
managed by SalveDb"`).

Isso sustenta soft deletes de ponta a ponta:

- `Database.delete(...).execute()` nunca emite um `DELETE` SQL. Ele executa
  `UPDATE <table> SET deletedAt = ? [WHERE ...]`, gravando o timestamp epoch-millis atual.
- Todo `select`/`count` (e o alvo de `update`/`delete`) automaticamente adiciona um AND com
  `"deletedAt" IS NULL` à sua cláusula `WHERE` — linhas com soft delete ficam invisíveis para o
  query builder sem nenhuma filtragem extra por parte de quem chama.
- Do lado da sincronização, um `deletedAt` não nulo é como uma linha puxada do servidor é
  reconhecida como um tombstone (veja o contrato de sincronização REST para detalhes).

## O padrão `satisfies`

Sempre declare um schema com `satisfies ISchemaDefinition<TEntity>`, nunca com uma anotação de
tipo `: ISchemaDefinition<TEntity>`:

```ts
import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

export interface User {
  id: number;
  name: string;
  email: string;
  updatedAt: number;
}

export const UserSchema = {
  name: 'users',
  version: 1,
  primaryKey: 'id',
  columns: {
    id: { type: 'integer' },
    name: { type: 'text' },
    email: { type: 'text' },
    updatedAt: { type: 'datetime', nullable: false },
  },
  indexes: [
    { name: 'idx_users_updated_at', columns: ['updatedAt'] },
    { name: 'idx_users_email', columns: ['email'] },
  ],
  sync: {
    enabled: true,
    direction: 'bidirectional',
    conflict: 'lastWriteWins',
    transport: 'rest',
    endpoint: { basePath: '/users', listQueryTemplate: 'updatedAfter={since}&limit={limit}' },
    pagination: { pageSize: 50, maxPagesPerSession: 20 },
  },
} satisfies ISchemaDefinition<User>;
```

`satisfies` faz a checagem de tipo de `UserSchema` contra `ISchemaDefinition<User>` **sem alargar
seu tipo inferido** — `UserSchema.columns` mantém sua forma literal precisa (o literal exato de
`type` de cada coluna, se `nullable`/`default` estão presentes ou não). `InferSelectModel<TSchema>`
e `InferInsertModel<TSchema>` (usados ao longo do [Query Builder](../guides/query-builder.md)) são
tipos mapeados que percorrem `TSchema["columns"]` chave por chave, ramificando nesses valores
literais de `type`/`nullable`/`default`.

Uma anotação `: ISchemaDefinition<User>` em vez disso alarga `UserSchema` para o próprio tipo da
interface — `columns` colapsa para o `Record<string, IColumnDefinition>` genérico, descartando
todo literal por coluna. `InferSelectModel`/`InferInsertModel` então não têm nada preciso sobre o
que mapear: toda coluna resolve para a mesma união genérica em vez do seu tipo real, e campos de
insert obrigatórios vs. opcionais não podem mais ser distinguidos. Chamadas de
`select`/`insert`/`update` contra esse schema perdem a segurança de tipos a nível de coluna, mesmo
que o schema em si ainda passe na checagem de tipos.

## Auto-migrações

`Database.register({ schema })`:

- Cria a tabela na primeira execução.
- A cada início subsequente do app, compara o `schema.version` registrado com a versão persistida
  pela última vez para aquela tabela. Se aumentou, aplica as migrações pendentes — **somente
  `ADD COLUMN`**. Colunas presentes no novo schema mas ausentes na tabela ativa são adicionadas;
  não há suporte a `DROP` ou `RENAME`, e não há arquivos de migração para escrever manualmente.

Isso significa que a evolução do schema é intencionalmente unidirecional e aditiva: renomear ou
remover uma coluna requer introduzir uma nova coluna e migrar os dados no nível da aplicação, não
editar diretamente a forma da tabela SQLite. `register` também valida a forma do schema
antecipadamente — `name`, `version` (um número) e `primaryKey` são todos obrigatórios, ou `register`
lança um erro imediatamente.

Para a mecânica completa de migração, o passo a passo de incremento de versão, e o que acontece
entre reinicializações do app, veja [Migrações](../guides/migrations.md).
