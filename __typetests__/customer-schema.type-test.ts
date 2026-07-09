import type { SchemaDefinition, InferSelectModel, InferInsertModel } from "../src/index";

type Expect<T extends true> = T;

/**
 * Igualdade estrutural via checagem mútua de `extends` (tuple-wrapped pra
 * evitar distribuição sobre unions). Usado em vez do truque clássico de
 * variância por função porque este falha (falso negativo) ao comparar um
 * mapped type computado com zero chaves contra um object literal plano —
 * mesmo quando ambos são estruturalmente equivalentes nos dois sentidos.
 */
type Equal<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

interface Customer {
  id: string;
  name: string;
  phone: string;
}

const CustomerSchema = {
  name: "customers",
  version: 1,
  primaryKey: "id",

  columns: {
    id: { type: "text" },
    name: { type: "text" },
    phone: { type: "text" },
  },

  sync: {
    enabled: true,
    direction: "bidirectional",
    strategy: "operations",
    conflict: "lastWriteWins",
    transport: "rest",

    endpoint: {
      method: "POST",
      path: "/sync/customers",
    },

    background: {
      enabled: true,
      minimumInterval: 15,
      requiresNetwork: true,
    },

    pagination: {
      pageSize: 200,
      maxPagesPerSession: 20,
    },

    request: {
      body: {
        cursor: { $ref: "cursor" },
        operations: { $ref: "operations" },
        pageSize: { $ref: "pageSize" },
      },
    },

    response: {
      cursor: "$.cursor",
      operations: "$.operations",
      hasMore: "$.hasMore",
    },
  },
} satisfies SchemaDefinition<Customer>;

// Nenhuma coluna é nullable ou tem default — select e insert devem ter todas
// as três colunas obrigatórias, sem `| null`.
export type _SelectOk = Expect<Equal<InferSelectModel<typeof CustomerSchema>, { id: string; name: string; phone: string }>>;

export type _InsertOk = Expect<Equal<InferInsertModel<typeof CustomerSchema>, { id: string; name: string; phone: string }>>;

// Guarda contra o helper `Equal` sempre resolver `true` — este caso deve
// falhar a comparação (shape errada) e por isso é esperado dar erro de tipo.
// @ts-expect-error — shape errada de propósito, ver comentário acima
export type _Negative = Expect<Equal<InferSelectModel<typeof CustomerSchema>, { id: number }>>;
