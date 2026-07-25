import { Router, type Request, type Response } from 'express';
import type { IResourceBase, IResourceModule, WritableFields } from './types';
import type { ResourceStore } from './store';
import type { ParseResult } from './validation';

export interface IResourceModuleConfig<TEntity extends IResourceBase> {
  /** Mount point, e.g. `"/users"`. */
  basePath: string;
  store: ResourceStore<TEntity>;
  /** Query param carrying the epoch-millis cursor, e.g. `"updatedAfter"`. */
  sinceParam: string;
  /** Query param carrying the page size, e.g. `"limit"`. */
  limitParam: string;
  /** Page size applied when the client omits `limitParam`. */
  defaultLimit: number;
  /** Hard ceiling so one call cannot drain the table. */
  maxLimit: number;
  parseCreate: (body: unknown) => ParseResult<WritableFields<TEntity>>;
  parsePatch: (body: unknown) => ParseResult<Partial<WritableFields<TEntity>>>;
}

/** Express may hand back a repeated query param as an array; take the first value. */
function queryValue(req: Request, name: string): string | undefined {
  const raw = req.query[name];
  if (typeof raw === 'string') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'string') return raw[0];
  return undefined;
}

/** Non-negative integer cursor, defaulting to 0 ("everything"). `null` signals a malformed value. */
function parseCursor(raw: string | undefined): number | null {
  if (raw === undefined) return 0;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 ? value : null;
}

/** Positive integer page size, clamped to `maxLimit`, defaulting to `defaultLimit`. */
function parseLimit(raw: string | undefined, defaultLimit: number, maxLimit: number): number | null {
  if (raw === undefined) return defaultLimit;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) return null;
  return Math.min(value, maxLimit);
}

/** Positive integer path id. `null` signals malformed. */
function parseId(raw: string): number | null {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : null;
}

function notFound(res: Response): void {
  res.status(404).json({ error: 'Not Found' });
}

function badRequest(res: Response, error: string): void {
  res.status(400).json({ error });
}

/**
 * Builds the 5 standard endpoints (list/get/create/update/delete) for one
 * entity, against a {@link ResourceStore}. This is the only file in the
 * package that knows about Express — every per-entity module configures this
 * factory instead of hand-rolling routes.
 */
export function createResourceModule<TEntity extends IResourceBase>(
  config: IResourceModuleConfig<TEntity>
): IResourceModule {
  const router = Router();

  router.get('/', (req, res) => {
    const since = parseCursor(queryValue(req, config.sinceParam));
    if (since === null) return badRequest(res, `${config.sinceParam} must be a non-negative integer`);

    const limit = parseLimit(queryValue(req, config.limitParam), config.defaultLimit, config.maxLimit);
    if (limit === null) return badRequest(res, `${config.limitParam} must be a positive integer`);

    res.json(config.store.list({ since, limit }));
  });

  router.get('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    // store.get() already returns null for a tombstoned row — this is where
    // a delete becomes invisible to a single-resource fetch.
    const row = config.store.get(id);
    if (row === null) return notFound(res);

    res.json(row);
  });

  router.post('/', (req, res) => {
    const result = config.parseCreate(req.body);
    if (!result.ok) return badRequest(res, result.error);

    res.status(201).json(config.store.create(result.value));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const result = config.parsePatch(req.body);
    if (!result.ok) return badRequest(res, result.error);
    if (Object.keys(result.value).length === 0) {
      return badRequest(res, 'No writable fields provided');
    }

    const row = config.store.update(id, result.value);
    if (row === null) return notFound(res);

    res.json(row);
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(res);

    const removed = config.store.remove(id);
    if (!removed) return notFound(res);

    res.status(204).end();
  });

  return { basePath: config.basePath, router };
}
