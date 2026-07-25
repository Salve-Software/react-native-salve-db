export type LogLevel = 'info' | 'warn' | 'error';

export interface LogFields {
  [key: string]: unknown;
}

/**
 * One JSON object per line on stdout/stderr — readable live under `npm run
 * dev` and trivially parseable if ever piped elsewhere. No logging library:
 * consistent with this package's minimal-dependency philosophy (see README).
 */
function write(level: LogLevel, event: string, fields: LogFields): void {
  const line = JSON.stringify({ time: new Date().toISOString(), level, event, ...fields });
  if (level === 'error') {
    console.error(line);
  } else {
    console.log(line);
  }
}

export const logger = {
  info: (event: string, fields: LogFields = {}): void => write('info', event, fields),
  warn: (event: string, fields: LogFields = {}): void => write('warn', event, fields),
  error: (event: string, fields: LogFields = {}): void => write('error', event, fields),
};
