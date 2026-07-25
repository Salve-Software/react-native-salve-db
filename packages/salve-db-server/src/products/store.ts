import { ResourceStore } from '../rest/store';
import type { IProduct } from './product';

export const productStore = new ResourceStore<IProduct>();
