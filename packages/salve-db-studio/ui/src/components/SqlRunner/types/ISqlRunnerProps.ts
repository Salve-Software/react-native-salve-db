import type { Row } from '../../../types';

export interface ISqlRunnerProps {
  runSql: (sql: string) => Promise<Row[]>;
}
