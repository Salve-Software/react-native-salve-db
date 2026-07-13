import type { AnySchema } from '../../../types';
import type { Row } from './Row';

export interface IState<TSchema extends AnySchema> {
  key: string;
  pages: Row<TSchema>[][];
  hasNextPage: boolean;
  error: unknown;
}
