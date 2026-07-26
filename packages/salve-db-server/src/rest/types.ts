import type { Router } from 'express';

/** Every syncable resource carries these three columns. */
export interface IResourceBase {
  id: number;
  /** Epoch millis of the last write. Also the pull cursor for live rows. */
  updatedAt: number;
  /** Epoch millis of the soft delete, or `null` while the row is alive. */
  deletedAt: number | null;
}

/**
 * What a deleted row collapses into on the wire: id + deletion time, nothing
 * else. Emitted only from the list endpoint.
 */
export interface ITombstone {
  id: number;
  deletedAt: number;
}

/** One element of the list endpoint's array: a full entity or a tombstone. */
export type ResourceRow<TEntity extends IResourceBase> = TEntity | ITombstone;

/** The client-supplied half of an entity (everything except the base columns). */
export type WritableFields<TEntity extends IResourceBase> = Omit<TEntity, keyof IResourceBase>;

/** A mountable domain module: its base path plus its router. */
export interface IResourceModule {
  readonly basePath: string;
  readonly router: Router;
}

export interface IListQuery {
  /** Exclusive lower bound on the cursor key. `0` means "everything". */
  since: number;
  /** Max rows to return. */
  limit: number;
}

/**
 * Data-layer port for one entity — the seam an adopter's own database sits
 * behind. `list`'s filter/sort maps directly to
 * `WHERE cursor_key > ? ORDER BY updated_at, id LIMIT ?`, where `cursor_key`
 * is `updated_at` for a live row and `deleted_at` for a tombstone.
 */
export interface IResourceStore<TEntity extends IResourceBase> {
  list(query: IListQuery): Promise<ResourceRow<TEntity>[]>;
  /** A live row, or `null` when it is missing *or* tombstoned. */
  get(id: number): Promise<TEntity | null>;
  create(fields: WritableFields<TEntity>): Promise<TEntity>;
  update(id: number, patch: Partial<WritableFields<TEntity>>): Promise<TEntity | null>;
  /** `false` when the row is missing or was already tombstoned — delete is not idempotent-silent. */
  remove(id: number): Promise<boolean>;
}
