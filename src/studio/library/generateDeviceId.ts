/** Stable-for-the-process id identifying this app instance to the Studio server across reconnects. */
export function generateDeviceId(): string {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
}
