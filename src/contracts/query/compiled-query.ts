/** SQL compilado a partir de um query builder, pronto pra execução nativa. */
export interface CompiledQuery {
  sql: string;
  params: unknown[];
}
