---
title: Guia Rápido
sidebar_label: Guia Rápido
---

Este guia percorre o mínimo necessário para definir um schema, montar o provider e rodar queries.
Cada passo linka para um guia mais aprofundado — esta página permanece executável de ponta a ponta
sem repeti-los.

## 1. Defina um schema

```ts
import type { ISchemaDefinition } from '@salve-software/react-native-salve-db';

export interface User {
  id: number;
  name: string;
  email: string;
  updatedAt: number;
}

// `satisfies`, never `: ISchemaDefinition<User>` — a type annotation widens
// `columns` and breaks InferSelectModel/InferInsertModel.
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
} satisfies ISchemaDefinition<User>;
```

`satisfies` verifica `UserSchema` contra `ISchemaDefinition<User>` sem alterar seu tipo inferido —
uma anotação `: ISchemaDefinition<User>` alargaria `columns` para o tipo declarado e quebraria
silenciosamente `InferSelectModel`/`InferInsertModel`, que dependem do formato literal mais estreito
que o TypeScript infere quando você usa `satisfies`.

A sincronização foi omitida aqui por brevidade — veja [Schemas](../guides/schemas.md) para índices,
relações e o contrato de sincronização completo.

## 2. Envolva seu app em `SalveDbProvider`

```tsx
import { SalveDbProvider } from '@salve-software/react-native-salve-db';
import { UserSchema } from './schemas/UserSchema';

export default function App() {
  return (
    <SalveDbProvider
      config={{ name: 'my-app-db' }}
      schemas={[UserSchema]}
    >
      <YourApp />
    </SalveDbProvider>
  );
}
```

`SalveDbProvider` executa `Database.configure` + `Database.register` para você e expõe
`{ isReady, isLoading, error }`. Adicione `baseUrl`, `credentials` e `background` quando habilitar a
sincronização — veja [Sincronização](../guides/sync.md).

## 3. Consulte e altere dados

```ts
import { Database, eq, and, like } from '@salve-software/react-native-salve-db';

// select — .limit() is mandatory, capped at 500
const users = Database.select(UserSchema)
  .where(and(eq('id', 1), like('email', '%@company.com')))
  .orderBy('updatedAt', 'desc')
  .limit(50)
  .execute();

Database.insert(UserSchema).values({ id: 2, name: 'Ada', email: 'ada@co.com', updatedAt: Date.now() }).execute();
Database.update(UserSchema).set({ name: 'Ada Lovelace' }).where(eq('id', 2)).execute();
Database.delete(UserSchema).where(eq('id', 2)).execute(); // soft delete
Database.count(UserSchema).execute();

Database.transaction((tx) => {
  tx.insert(UserSchema).values({ id: 3, name: 'Grace', email: 'grace@co.com', updatedAt: Date.now() }).execute();
  tx.update(UserSchema).set({ name: 'Grace Hopper' }).where(eq('id', 3)).execute();
});
```

Toda coluna usada em `where()`/`orderBy()` precisa ser a coluna líder de um índice declarado (ou a
chave primária) — veja o guia do query builder para entender por quê e como contornar isso. API
completa do builder, operadores e o limite `MAX_BATCH_INSERT_ROWS` para inserts em lote:
[Query Builder](../guides/query-builder.md).

## 4. Assine mudanças com `useQuery`

```tsx
import { useQuery } from '@salve-software/react-native-salve-db';
import { eq } from '@salve-software/react-native-salve-db';
import { UserSchema } from './schemas/UserSchema';

function UserList({ search }: { search: string }) {
  const { data, isLoading, error } = useQuery({
    schema: UserSchema,
    // queryFn recebe um builder de `select` já vinculado a UserSchema — aplique
    // where/orderBy/limit/offset diretamente nele, não chame `.select()` de novo.
    queryFn: (q) => q.where(eq('name', search)).orderBy('updatedAt', 'desc').limit(50),
    deps: [search],
  });

  // re-runs automatically on any write to `users`, from any source —
  // your own code, raw SQL, a migration, or the background sync engine
  return null;
}
```

Para `useInfiniteQuery`, `useDatabaseReady` e o comportamento de sincronização disparada por leitura
com throttle, veja [Hooks](../guides/hooks.md).

## Próximos passos

- [Schemas](../guides/schemas.md) — colunas, índices, relações, contratos de sincronização
- [Query Builder](../guides/query-builder.md) — API completa do builder e a regra de colunas indexadas
- [Hooks](../guides/hooks.md) — `useQuery`, `useInfiniteQuery`, `useDatabaseReady`
- [Sincronização](../guides/sync.md) — habilitando sincronização, credenciais, agendamento em
  background, resolução de conflitos
