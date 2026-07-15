import type { AnySchema } from '../types';
import { queryCache } from '../cache';
import { Database } from '../database';
import { createSalveDbProvider } from './library';

export type { ISalveDbProviderProps, IDatabaseReadyState } from './types';
export { SalveDbContext } from './SalveDbContext';

export const SalveDbProvider = createSalveDbProvider({
  configure: Database.configure,
  register: (schema: AnySchema) => Database.register({ schema }),
  subscribeNative: () => queryCache.subscribeNative(),
  unsubscribeNative: () => queryCache.unsubscribeNative(),
});
