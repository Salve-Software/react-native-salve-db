import type { QueryResult } from '../../../../specs/types';

/** Reassembles the columns+rows matrix a native query returns into one plain object per row. */
export function mapQueryResultToRows(result: QueryResult): Record<string, unknown>[] {
  return result.rows.map((row) => {
    const obj: Record<string, unknown> = {};
    result.columns.forEach((col, i) => { obj[col] = row[i] });
    return obj;
  });
}
