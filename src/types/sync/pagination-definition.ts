/** Pagination config for an {@link ISyncDefinition}. */
export interface IPaginationDefinition {
  /**
   * Items per page. Used both in the `$ref: "pageSize"` of the request (pull)
   * and to cap how many sync_queue rows are sent per push request.
   */
  pageSize: number;

  /**
   * Max pages per sync session (same connectivity window). Prevents a long loop
   * draining battery in a single scheduler wake. When the cap is reached with
   * `hasMore` still `true`, the engine stops and resumes on the next wake —
   * the cursor has already advanced as far as it got.
   *
   * @default 20
   */
  maxPagesPerSession?: number;
}
