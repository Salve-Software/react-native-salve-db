import type { IStudioSocket, StudioSocketFactory } from '../types';

/** Default {@link StudioSocketFactory}: the runtime's global `WebSocket` (RN provides one; tests inject their own). */
export const createDefaultStudioSocket: StudioSocketFactory = (url) => {
  const ctor = (globalThis as unknown as { WebSocket?: new (url: string) => IStudioSocket }).WebSocket;
  if (!ctor) {
    throw new Error('StudioAgent: no global WebSocket implementation available');
  }
  return new ctor(url);
};
