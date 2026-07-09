# Query Layer Contracts (ORM)

> Camada de leitura/escrita local, inspirada no Drizzle. Diferente de `architecture.md` (contrato de **sync**, interpretado pelo Native Sync Engine sem JS), esta camada roda em **foreground**, com JS já de pé — usuário chamando `db.select()...` a partir de uma tela. A restrição "sem JS" do projeto é sobre o sync engine rodando sem supervisão em background; não se aplica aqui.

---

## Decisão: execução via SQL string + params (não AST nativo)

Duas opções foram avaliadas:

- **A. JS monta SQL parametrizado, native só executa.** Builder em TS gera `{ sql: string, params: unknown[] }` e manda pro nativo via JSI (Nitro).
- **B. JS monta um descriptor declarativo (tipo o `SyncDefinition`), engine nativo compila pra SQL.**

**Escolhido: A.** É o caminho mais performático:

- O gargalo real de uma query é I/O do SQLite (disco), não a montagem da string em JS — isso custa microssegundos, irrelevante perto do tempo de disco.
- Marshalling de string + array de primitivos via JSI (Nitro HybridObjects) é mais barato que serializar uma árvore de AST aninhada.
- B exigiria reimplementar um mini query-compiler em **Swift e Kotlin**, dobrando risco de bug/inconsistência entre plataformas, sem ganho de velocidade real — o SQL final seria o mesmo.
- A permite **cache de prepared statement nativo**, chaveado pela string SQL: o builder tende a gerar um número pequeno de "formatos" de SQL (mesmo WHERE shape, params diferentes), então o native evita re-parse/re-plan do SQLite a cada chamada. Esse é o ganho de perf real, e funciona só com A.

```ts
export interface CompiledQuery {
  sql: string;
  params: unknown[];
}
```

O native (`NitroSalveDb.execute(sql, params)`) mantém um LRU de prepared statements por texto de SQL.

---

## Inferência de tipos

Mapeamento de `ColumnDefinition.type` (já existente em `architecture.md`) pro tipo TS:

| `ColumnDefinition.type` | TS |
|---|---|
| `text` | `string` |
| `integer` | `number` |
| `real` | `number` |
| `boolean` | `boolean` (SQLite guarda 0/1, coerção fica no native) |
| `blob` | `Uint8Array` |
| `datetime` | `number` (epoch millis — mesma convenção do `SyncOperation.updatedAt`, sem ambiguidade de timezone) |

```ts
export type InferSelectModel<TSchema extends SchemaDefinition<any>> = {
  [K in keyof TSchema["columns"]]:
    ColumnTsType<TSchema["columns"][K]["type"]>
    | (TSchema["columns"][K]["nullable"] extends true ? null : never);
};

export type InferInsertModel<TSchema extends SchemaDefinition<any>> = {
  [K in keyof TSchema["columns"] as
    TSchema["columns"][K]["nullable"] extends true ? K
      : TSchema["columns"][K]["default"] extends undefined ? never : K
  ]?: ColumnTsType<TSchema["columns"][K]["type"]>;
} & {
  [K in keyof TSchema["columns"] as
    TSchema["columns"][K]["nullable"] extends true ? never
      : TSchema["columns"][K]["default"] extends undefined ? K : never
  ]: ColumnTsType<TSchema["columns"][K]["type"]>;
};
```

Coluna `nullable` ou com `default` vira opcional no insert; o resto é obrigatório. `primaryKey` é obrigatório no insert no MVP — não existe autoincrement nativo declarado (`id` é responsabilidade do app, ex: uuid gerado no client).

---

## Operadores (condições de `where`)

Subset funcional, mesma ideia do Drizzle:

```ts
export type Condition = unknown; // opaco pro usuário, construído pelas funções abaixo

export declare function eq<T>(column: T, value: T): Condition;
export declare function ne<T>(column: T, value: T): Condition;
export declare function gt<T>(column: T, value: T): Condition;
export declare function gte<T>(column: T, value: T): Condition;
export declare function lt<T>(column: T, value: T): Condition;
export declare function lte<T>(column: T, value: T): Condition;
export declare function like(column: string, pattern: string): Condition;
export declare function inArray<T>(column: T, values: T[]): Condition;
export declare function isNull(column: unknown): Condition;
export declare function isNotNull(column: unknown): Condition;

export declare function and(...conditions: Condition[]): Condition;
export declare function or(...conditions: Condition[]): Condition;
export declare function not(condition: Condition): Condition;
```

Fora do MVP: `ilike`, `between`, `arrayContains`, subqueries.

---

## Query Builder

```ts
export interface QueryClient {

  select<TSchema extends SchemaDefinition<any>>(
    schema: TSchema
  ): SelectQueryBuilder<TSchema>;

  insert<TSchema extends SchemaDefinition<any>>(
    schema: TSchema
  ): InsertQueryBuilder<TSchema>;

  update<TSchema extends SchemaDefinition<any>>(
    schema: TSchema
  ): UpdateQueryBuilder<TSchema>;

  delete<TSchema extends SchemaDefinition<any>>(
    schema: TSchema
  ): DeleteQueryBuilder<TSchema>;

  /**
   * BEGIN/COMMIT/ROLLBACK nativo. Se `fn` lançar, faz ROLLBACK.
   * Todo write dentro de `tx` ainda dispara as triggers normalmente
   * (a fila de sync só é populada no COMMIT, não em cada write isolado).
   */
  transaction<T>(fn: (tx: QueryClient) => Promise<T>): Promise<T>;

  /**
   * Escape hatch. Sem type-safety, sem inferência — mas como a trigger
   * é a nível de tabela SQLite, raw SQL ainda fica rastreado pela
   * sync_queue normalmente.
   */
  execute(sql: string, params?: unknown[]): Promise<unknown[]>;

}

export interface SelectQueryBuilder<TSchema extends SchemaDefinition<any>> {
  where(condition: Condition): this;
  orderBy(column: keyof InferSelectModel<TSchema>, direction?: "asc" | "desc"): this;
  limit(n: number): this;
  offset(n: number): this;
  execute(): Promise<InferSelectModel<TSchema>[]>;
}

export interface InsertQueryBuilder<TSchema extends SchemaDefinition<any>> {
  values(row: InferInsertModel<TSchema>): this;
  execute(): Promise<void>;
}

export interface UpdateQueryBuilder<TSchema extends SchemaDefinition<any>> {
  set(patch: Partial<InferInsertModel<TSchema>>): this;
  where(condition: Condition): this;
  execute(): Promise<void>;
}

export interface DeleteQueryBuilder<TSchema extends SchemaDefinition<any>> {
  where(condition: Condition): this;
  execute(): Promise<void>;
}
```

Exemplo:

```ts
const activeCustomers = await db
  .select(CustomerSchema)
  .where(eq(CustomerSchema.columns.active, true))
  .orderBy("name")
  .limit(50)
  .execute();

await db.transaction(async (tx) => {
  await tx.insert(OrderSchema).values({ id, customerId, total }).execute();
  await tx.insert(OrderItemSchema).values({ orderId: id, sku, qty }).execute();
});
```

---

## Trigger bypass durante apply do sync

A trigger de mudança (`docs/overview.md` → Trigger Engine) dispara em **qualquer** write na tabela — inclusive quando o Native Sync Engine aplica operações baixadas do servidor. Sem tratamento, isso reenfileira pra `sync_queue` um dado que acabou de chegar do servidor: na próxima sync o engine manda esse dado de volta como se fosse mudança nova, gerando round-trip desperdiçado ou, pior, ping-pong com o server.

A trigger só enxerga o que está no banco — não recebe contexto de quem/o quê fez o write. Por isso o "aviso" precisa ser um estado gravado no próprio banco: uma tabela de lock de 1 linha, checada pela trigger via `WHEN NOT EXISTS (...)`.

### Tabela de lock

```sql
CREATE TABLE IF NOT EXISTS _sync_apply_lock (
  id INTEGER PRIMARY KEY CHECK (id = 1)
);
```

Só existe ou não existe uma linha — não é contador, não guarda payload.

### Trigger por tabela sincronizável

Gerada automaticamente pelo Migration Engine pra cada schema com `sync.enabled: true`, uma trigger por tipo de operação. Exemplo pra `customers`:

```sql
CREATE TRIGGER IF NOT EXISTS customers_sync_after_insert
AFTER INSERT ON customers
WHEN NOT EXISTS (SELECT 1 FROM _sync_apply_lock)
BEGIN
  INSERT INTO sync_queue (operation, entity, entity_id, payload, updated_at)
  VALUES (
    'insert',
    'customers',
    NEW.id,
    json_object('id', NEW.id, 'name', NEW.name, 'phone', NEW.phone),
    CAST(strftime('%s','now') * 1000 AS INTEGER)
  );
END;

CREATE TRIGGER IF NOT EXISTS customers_sync_after_update
AFTER UPDATE ON customers
WHEN NOT EXISTS (SELECT 1 FROM _sync_apply_lock)
BEGIN
  INSERT INTO sync_queue (operation, entity, entity_id, payload, updated_at)
  VALUES (
    'update',
    'customers',
    NEW.id,
    json_object('id', NEW.id, 'name', NEW.name, 'phone', NEW.phone),
    CAST(strftime('%s','now') * 1000 AS INTEGER)
  );
END;

CREATE TRIGGER IF NOT EXISTS customers_sync_after_delete
AFTER DELETE ON customers
WHEN NOT EXISTS (SELECT 1 FROM _sync_apply_lock)
BEGIN
  INSERT INTO sync_queue (operation, entity, entity_id, payload, updated_at)
  VALUES (
    'delete',
    'customers',
    OLD.id,
    json_object('id', OLD.id),
    CAST(strftime('%s','now') * 1000 AS INTEGER)
  );
END;
```

`WHEN NOT EXISTS (SELECT 1 FROM _sync_apply_lock)` é o bypass inteiro — condição avaliada pelo próprio SQLite antes do corpo da trigger rodar, sem código de aplicação envolvido. A lista de colunas do `json_object(...)` é gerada a partir de `schema.columns` no momento em que a trigger é criada (mesma hora que a tabela é criada/migrada) — não é hardcoded por tabela no engine.

### Ciclo do Native Sync Engine ao aplicar página baixada

```sql
BEGIN;

INSERT OR IGNORE INTO _sync_apply_lock (id) VALUES (1);

-- aplica as `operations` da página baixada (INSERT/UPDATE/DELETE nas tabelas sincronizáveis)
-- triggers acima disparam mas o WHEN barra o enfileiramento

DELETE FROM _sync_apply_lock;

COMMIT;
```

Tudo dentro de uma única transação: se o app crashar no meio, o rollback desfaz o apply **e** o lock junto — nunca fica "travado ligado". Pressupõe apply feito numa única transação/conexão por sessão de sync (é assim que o fluxo já funciona, ver `overview.md` → Native Sync Engine).

Escrita feita via query builder (`db.insert(...)`, `db.update(...)`, `db.delete(...)`, ou `db.execute()` raw) roda **fora** dessa janela de lock → `_sync_apply_lock` vazio → trigger loga normal na `sync_queue`. É esse o mecanismo que garante que "toda escrita local real passa pela sync_queue" continua verdadeiro mesmo com o apply do sync usando as mesmas tabelas.

---

## Fora do MVP

- Relations/joins (`db.query.x.findMany({ with: {...} })`)
- Funções de agregação (`count`, `sum`, `avg`, `groupBy`)
- `ilike`, `between`, subqueries, `returning()`
- Prepared statement API exposta ao usuário (fica interno, só cache)
- Streaming/cursor de resultado grande (usa `limit`/`offset` por enquanto)
