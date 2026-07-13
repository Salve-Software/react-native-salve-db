import type { InferSelectModel } from '../../../database/classes/QueryDb/classes/SelectQueryBuilder/types';
import type { AnySchema } from '../../../types';

export type Row<TSchema extends AnySchema> = InferSelectModel<TSchema>;
