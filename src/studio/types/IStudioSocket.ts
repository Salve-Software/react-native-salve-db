/** Minimal surface this module needs from a WebSocket instance — avoids depending on DOM/RN ambient types. */
export interface IStudioSocket {
  send(data: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export type StudioSocketFactory = (url: string) => IStudioSocket;
