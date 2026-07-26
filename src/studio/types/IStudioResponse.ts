/** Reply to one {@link IStudioCommand}, sent back to the browser tab that asked for it. */
export type IStudioResponse =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string };
