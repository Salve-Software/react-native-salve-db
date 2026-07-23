/** Foreign-key relation from this schema to a parent schema. */
export interface IRelationDefinition<TEntity> {
  column: keyof TEntity;
  references: string;
}
