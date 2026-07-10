/** SQL compiled from a query builder, ready for native execution. */
export interface ICompiledQuery {
  sql: string;
  params: unknown[];
}
