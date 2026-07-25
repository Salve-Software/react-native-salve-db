import { createResourceModule } from '../rest/resource';
import type { IResourceModule } from '../rest/types';
import type { ResourceStore } from '../rest/store';
import type { IProduct } from './product';
import { parseCreateProduct, parsePatchProduct } from './product';
import { productStore } from './store';

/**
 * Builds a `/products` module against any store instance — see
 * {@link createUsersModule} for why tests want this instead of the shared
 * singleton.
 *
 * Products deliberately use different param names than `users` — nothing in
 * `rest/` knows these strings, which is the proof that per-module param
 * naming is real, exercised configuration, not an unused option.
 */
export function createProductsModule(store: ResourceStore<IProduct>): IResourceModule {
  return createResourceModule<IProduct>({
    basePath: '/products',
    store,
    sinceParam: 'modified_since',
    limitParam: 'page_size',
    defaultLimit: 25,
    maxLimit: 100,
    parseCreate: parseCreateProduct,
    parsePatch: parsePatchProduct,
  });
}

export const productsModule = createProductsModule(productStore);
