import type { IStudioCommand } from '../types';

/** Parses one incoming socket frame into a command, or `null` if it isn't a well-formed one. */
export function parseStudioCommand(data: unknown): IStudioCommand | null {
  if (typeof data !== 'string') return null;
  try {
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed.id !== 'string' || typeof parsed.type !== 'string') return null;
    return parsed as IStudioCommand;
  } catch {
    return null;
  }
}
