import { Router, type Request, type Response } from 'express';
import type { IResourceBase, IResourceModule, IResourceStore, WritableFields } from './types';
import type { ParseResult } from './validation';
import { logger } from './logger';

export interface IResourceModuleConfig<TEntity extends IResourceBase> {
  /** Mount point, e.g. `"/users"`. */
  basePath: string;
  store: IResourceStore<TEntity>;
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

function notFound(req: Request, res: Response, basePath: string): void {
  logger.warn('resource.not_found', { basePath, method: req.method, path: req.path });
  res.status(404).json({ error: 'Not Found' });
}

function badRequest(req: Request, res: Response, basePath: string, error: string): void {
  logger.warn('resource.bad_request', { basePath, method: req.method, path: req.path, error });
  res.status(400).json({ error });
}

/**
 * Builds the 5 standard endpoints (list/get/create/update/delete) for one
 * entity, against an {@link IResourceStore}. This is the only file in the
 * package that knows about Express — every per-entity module configures this
 * factory instead of hand-rolling routes. Handlers are async — Express 5
 * forwards a rejected handler promise into the error middleware automatically.
 */
export function createResourceModule<TEntity extends IResourceBase>(
  config: IResourceModuleConfig<TEntity>
): IResourceModule {
  const router = Router();

  router.get('/', async (req, res) => {
    const since = parseCursor(queryValue(req, config.sinceParam));
    if (since === null) return badRequest(req, res, config.basePath, `${config.sinceParam} must be a non-negative integer`);

    const limit = parseLimit(queryValue(req, config.limitParam), config.defaultLimit, config.maxLimit);
    if (limit === null) return badRequest(req, res, config.basePath, `${config.limitParam} must be a positive integer`);

    const rows = await config.store.list({ since, limit });
    logger.info('resource.list', { basePath: config.basePath, since, limit, returned: rows.length });
    res.json(rows);
  });

  router.get('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(req, res, config.basePath);

    // store.get() already returns null for a tombstoned row — this is where
    // a delete becomes invisible to a single-resource fetch.
    const row = await config.store.get(id);
    if (row === null) return notFound(req, res, config.basePath);

    logger.info('resource.get', { basePath: config.basePath, id });
    res.json(row);
  });

  router.post('/', async (req, res) => {
    const result = config.parseCreate(req.body);
    if (!result.ok) return badRequest(req, res, config.basePath, result.error);

    const created = await config.store.create(result.value);
    logger.info('resource.create', { basePath: config.basePath, id: created.id });
    res.status(201).json(created);
  });

  router.patch('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(req, res, config.basePath);

    const result = config.parsePatch(req.body);
    if (!result.ok) return badRequest(req, res, config.basePath, result.error);
    if (Object.keys(result.value).length === 0) {
      return badRequest(req, res, config.basePath, 'No writable fields provided');
    }

    const row = await config.store.update(id, result.value);
    if (row === null) return notFound(req, res, config.basePath);

    logger.info('resource.update', { basePath: config.basePath, id, fields: Object.keys(result.value) });
    res.json(row);
  });

  router.delete('/:id', async (req, res) => {
    const id = parseId(req.params.id);
    if (id === null) return notFound(req, res, config.basePath);

    const removed = await config.store.remove(id);
    if (!removed) return notFound(req, res, config.basePath);

    logger.info('resource.delete', { basePath: config.basePath, id });
    res.status(204).end();
  });

  return { basePath: config.basePath, router };
}
