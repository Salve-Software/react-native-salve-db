/** Pagination config */
export interface IPaginationDefinition {
  /**
   * Items per pull page (`<limitParam>`). Push has no batching concept —
   * each queued item is its own HTTP call, regardless of this value.
   */
  pageSize: number;

  /**
   * Max pull pages per sync session (same connectivity window). Prevents a
   * long loop draining battery in a single scheduler wake. When the cap is
   * reached with a page still full, the engine stops and resumes on the
   * next wake — the cursor has already advanced as far as it got.
   *
   * @default 20
   */
  maxPagesPerSession?: number;
}
