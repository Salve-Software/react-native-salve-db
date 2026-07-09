import type { SchemaDefinition } from "./schema-definition";

/**
 * Constraint genérica que aceita qualquer {@link SchemaDefinition}.
 *
 * O `any` aqui é intencional e necessário (mirrors Drizzle): `unknown` quebra
 * `keyof TEntity` em `SchemaDefinition.primaryKey` ao ser usado como bound de
 * generic (`TSchema extends SchemaDefinition<unknown>` não tipa `keyof
 * TEntity` de forma útil). Esta é a única ocorrência de `any` do pacote.
 */
export type AnySchema = SchemaDefinition<any>;
