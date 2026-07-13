export const MAX_SYNC_PAGE_SIZE = 500;

/** Cap on rows per `InsertQueryBuilder.values()` call, keeping bound params under SQLite's default limit (999). */
export const MAX_BATCH_INSERT_ROWS = 500;
