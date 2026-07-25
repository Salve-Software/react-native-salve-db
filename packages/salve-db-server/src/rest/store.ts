import type { IResourceBase, IStoredRow, ResourceRow, WritableFields } from './types';

export interface IListQuery {
  /** Exclusive lower bound on the cursor key. `0` means "everything". */
  since: number;
  /** Max rows to return. */
  limit: number;
}

/**
 * In-memory data layer for one entity. This is the seam an adopter replaces
 * with a real database — the five methods below are the whole port surface.
 * `list`'s filter/sort maps directly to
 * `WHERE cursor_key > ? ORDER BY updated_at, id LIMIT ?`.
 */
export class ResourceStore<TEntity extends IResourceBase> {
  private readonly _rows = new Map<number, IStoredRow<TEntity>>();
  private _nextId = 1;
  private _clock = 0;

  /**
   * Strictly monotonic write clock. `Date.now()` can return the same
   * millisecond for two consecutive writes; if two rows shared a cursor key,
   * an exclusive (`>`) cursor could skip the loser of the tie at a page
   * boundary, and an inclusive (`>=`) one could re-serve it forever. Handing
   * out a unique, always-increasing key removes the whole class of bug.
   */
  private _tick(): number {
    const now = Date.now();
    this._clock = now > this._clock ? now : this._clock + 1;
    return this._clock;
  }

  /**
   * Rows whose cursor key is strictly greater than `since`, oldest first,
   * capped at `limit`. Ties on the cursor key are broken by `id` so the order
   * is total and stable — a real database can collide on `updatedAt` even
   * though this in-memory store cannot, and page boundaries must never
   * depend on insertion order.
   */
  list({ since, limit }: IListQuery): ResourceRow<TEntity>[] {
    return [...this._rows.values()]
      .filter((stored) => stored.cursorKey > since)
      .sort((a, b) => a.cursorKey - b.cursorKey || a.row.id - b.row.id)
      .slice(0, limit)
      .map((stored) => stored.row);
  }

  /** A live row, or `null` when it is missing *or* tombstoned. */
  get(id: number): TEntity | null {
    const stored = this._rows.get(id);
    if (stored === undefined || stored.row.deletedAt !== null) return null;
    return stored.row as TEntity;
  }

  create(fields: WritableFields<TEntity>): TEntity {
    const updatedAt = this._tick();
    // The only cast in this store: TS cannot prove that spreading the caller's
    // fields plus the three base columns reconstitutes TEntity. Contained
    // here so no caller ever needs one.
    const row = { ...fields, id: this._nextId++, updatedAt, deletedAt: null } as unknown as TEntity;
    this._rows.set(row.id, { cursorKey: updatedAt, row });
    return row;
  }

  update(id: number, patch: Partial<WritableFields<TEntity>>): TEntity | null {
    const current = this.get(id);
    if (current === null) return null;
    const updatedAt = this._tick();
    const row = { ...current, ...patch, id, updatedAt, deletedAt: null } as TEntity;
    this._rows.set(id, { cursorKey: updatedAt, row });
    return row;
  }

  /**
   * Soft delete. The stored value is *replaced* by `{ id, deletedAt }` — the
   * entity's other fields are dropped from memory, not merely filtered out on
   * the way to the response, so `list()` cannot leak a stale field even by
   * accident. Returns `false` when the row is missing or was already
   * tombstoned (delete is not idempotent-silent — see the README).
   */
  remove(id: number): boolean {
    const stored = this._rows.get(id);
    if (stored === undefined || stored.row.deletedAt !== null) return false;
    const deletedAt = this._tick();
    this._rows.set(id, { cursorKey: deletedAt, row: { id, deletedAt } });
    return true;
  }
}
