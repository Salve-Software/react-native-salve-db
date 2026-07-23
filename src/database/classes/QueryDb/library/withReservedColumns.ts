import type { AnySchema, IColumnDefinition } from '../../../../types';

const RESERVED_DELETED_AT_COLUMN: IColumnDefinition = { type: 'datetime', nullable: true };

export function withReservedColumns<TSchema extends AnySchema>(schema: TSchema): TSchema {
  if (schema.columns.deletedAt) {
    throw new Error(`Schema "${schema.name}": 'deletedAt' is a reserved column managed by SalveDb`);
  }
  return {
    ...schema,
    columns: {
      ...schema.columns,
      deletedAt: RESERVED_DELETED_AT_COLUMN,
    },
  };
}
