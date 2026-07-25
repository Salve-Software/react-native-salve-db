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

/**
 * Internal store record. `cursorKey` is the single sort/filter axis for the
 * list endpoint: `updatedAt` for live rows, `deletedAt` for tombstones. It is
 * held on the envelope rather than read off `row` so a tombstone can be
 * ordered without carrying an `updatedAt` field on the wire.
 *
 * A consumer walking the list endpoint advances its own cursor the same way:
 * `row.deletedAt ?? row.updatedAt`, uniform across both row shapes.
 */
export interface IStoredRow<TEntity extends IResourceBase> {
  cursorKey: number;
  row: ResourceRow<TEntity>;
}

/** A mountable domain module: its base path plus its router. */
export interface IResourceModule {
  readonly basePath: string;
  readonly router: Router;
}
