import { createResourceModule } from '../rest/resource';
import type { IResourceModule, IResourceStore } from '../rest/types';
import type { IUser } from './user';
import { parseCreateUser, parsePatchUser } from './user';
import { userStore } from './store';

/**
 * Builds a `/users` module against any store instance — the production
 * server uses the shared {@link userStore} singleton; tests pass a fresh
 * PGlite-backed store per case so runs never share state with each other.
 *
 * Users use the default-flavoured param names (`updatedAfter` / `limit`).
 */
export function createUsersModule(store: IResourceStore<IUser>): IResourceModule {
  return createResourceModule<IUser>({
    basePath: '/users',
    store,
    sinceParam: 'updatedAfter',
    limitParam: 'limit',
    defaultLimit: 50,
    maxLimit: 200,
    parseCreate: parseCreateUser,
    parsePatch: parsePatchUser,
  });
}

export const usersModule = createUsersModule(userStore);
