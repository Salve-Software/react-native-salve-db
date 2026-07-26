/** One connected app instance, as broadcast to browser tabs so they can pick which device to browse. */
export interface IStudioDevice {
  id: string;
  platform: string;
  dbName: string;
}
