import type { AnySchema } from '../../../../types';

export const assertIndexedColumns = (schema: AnySchema, columns: string[]): void => {
  for (const column of columns) {
    if (column === schema.primaryKey) continue;

    const isIndexed = schema.indexes?.some((index) => index.columns[0] === column);
    if (!isIndexed) {
      throw new Error(
        `Synchronous execute() requires an index covering column "${column}" as its leading column ` +
        `(schema "${schema.name}"). Declare it in schema.indexes, or remove it from where()/orderBy().`,
      );
    }
  }
};
