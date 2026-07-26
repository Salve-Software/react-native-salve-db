import { PostgresResourceStore } from '../rest/store';
import { pool } from '../db';
import type { IProduct } from './product';

export const productStore = new PostgresResourceStore<IProduct>(pool, { table: 'products', columns: ['name', 'price'] });
