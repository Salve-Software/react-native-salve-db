import { PostgresResourceStore } from '../rest/store';
import { pool } from '../db';
import type { IUser } from './user';

export const userStore = new PostgresResourceStore<IUser>(pool, { table: 'users', columns: ['name', 'email'] });
